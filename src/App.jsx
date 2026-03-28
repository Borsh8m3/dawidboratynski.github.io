import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const MEAL_TYPES = ["Śniadanie", "Lunch", "Obiad", "Podwieczorek", "Kolacja"];
const DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

export default function App() {
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [mealPlan, setMealPlan] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);

  const [activeModal, setActiveModal] = useState(null); 
  const [selectedCell, setSelectedCell] = useState(null);

  const handleLogout = useCallback(() => supabase.auth.signOut(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));

    let logoutTimer;
    const resetTimer = () => {
      clearTimeout(logoutTimer);
      logoutTimer = setTimeout(handleLogout, 30 * 60 * 1000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [handleLogout]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, weekOffset]);

  async function fetchData() {
    const { data: prods } = await supabase.from('products').select('*');
    const { data: recs } = await supabase.from('recipes').select('*');
    const { data: plan } = await supabase.from('meal_plan').select('*, recipes(*)');
    setProducts(prods || []);
    setRecipes(recs || []);
    setMealPlan(plan || []);
  }

  const getWeekDates = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) + (weekOffset * 7);
    return DAYS.map((name, i) => {
      const d = new Date(new Date().setDate(diff + i));
      return { name, fullDate: d.toISOString().split('T')[0], displayDate: d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) };
    });
  };

  const weekDates = getWeekDates();

  if (!session) return <LoginView />;

  return (
    <div style={appContainer}>
      <header style={headerStyle}>
        <div>
          <h1 style={{margin: 0}}>🍴 Smart Planer</h1>
          <p>{weekDates[0].displayDate} - {weekDates[6].displayDate}</p>
        </div>
        <div style={navButtons}>
          <button onClick={() => setWeekOffset(prev => prev - 1)} style={btnSec}>⬅</button>
          <button onClick={() => setWeekOffset(0)} style={btnSec}>Dziś</button>
          <button onClick={() => setWeekOffset(prev => prev + 1)} style={btnSec}>➡</button>
          <button onClick={() => setActiveModal('product')} style={btnSec}>📦 Spiżarnia</button>
          <button onClick={() => setActiveModal('recipe')} style={btnPrim}>👨‍🍳 Przepisy</button>
          <button onClick={handleLogout} style={btnDanger}>Wyloguj</button>
        </div>
      </header>

      <div style={gridStyle}>
        <div />
        {MEAL_TYPES.map(m => <div key={m} style={mealHeader}>{m}</div>)}
        {weekDates.map(day => (
          <React.Fragment key={day.fullDate}>
            <div style={dayCell}><b>{day.name}</b><br/><small>{day.displayDate}</small></div>
            {MEAL_TYPES.map(type => {
              const meal = mealPlan.find(p => p.date === day.fullDate && p.meal_type === type);
              return (
                <div key={`${day.fullDate}-${type}`} style={cellStyle} onClick={() => { setSelectedCell({ date: day.fullDate, type }); setActiveModal('cell'); }}>
                  {meal ? <div style={mealTag}>{meal.recipes.name}</div> : <span style={{opacity: 0.2}}>+</span>}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {activeModal === 'cell' && (
        <Modal title="Wybierz posiłek" onClose={() => setActiveModal(null)}>
          {recipes.filter(r => r.category === selectedCell?.type).map(r => (
            <div key={r.id} style={recipeListItem} onClick={async () => {
              await supabase.from('meal_plan').insert([{ date: selectedCell.date, meal_type: selectedCell.type, recipe_id: r.id }]);
              setActiveModal(null);
              fetchData();
            }}>
              <b>{r.name}</b> <span>{r.total_cost} zł</span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

// --- KOMPONENT LOGOWANIA (NAPRAWIONY) ---
function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Błąd: " + error.message);
  };

  return (
    <div style={loginOverlay}>
      <form onSubmit={handleLogin} style={loginForm}>
        <h2 style={{textAlign: 'center', marginBottom: '20px'}}>🔐 Logowanie</h2>
        <input type="email" placeholder="Email" style={inputS} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Hasło" style={inputS} onChange={e => setPassword(e.target.value)} />
        <button type="submit" style={btnSuccessFull}>Zaloguj się</button>
      </form>
    </div>
  );
}

// --- MODAL HELPER ---
function Modal({ title, children, onClose }) {
  return (
    <div style={overlayS}><div style={modalS}>
      <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px'}}>
        <h3>{title}</h3><button onClick={onClose} style={{border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px'}}>✕</button>
      </div>
      {children}
    </div></div>
  );
}

// --- STYLE ---
const appContainer = { padding: '20px', backgroundColor: '#f0f2f5', minHeight: '100vh', fontFamily: 'sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'white', padding: '15px', borderRadius: '15px' };
const navButtons = { display: 'flex', gap: '8px' };
const gridStyle = { display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)', gap: '10px' };
const mealHeader = { textAlign: 'center', fontWeight: 'bold', color: '#4a5568' };
const dayCell = { background: 'white', padding: '10px', borderRadius: '10px', textAlign: 'center', borderLeft: '4px solid #38a169' };
const cellStyle = { height: '80px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const mealTag = { fontSize: '11px', textAlign: 'center', background: '#e2e8f0', padding: '4px', borderRadius: '4px' };
const loginOverlay = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f1f5f9' };
const loginForm = { background: 'white', padding: '30px', borderRadius: '20px', width: '300px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' };
const inputS = { width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' };
const btnPrim = { background: '#3182ce', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer' };
const btnSec = { background: '#edf2f7', color: '#2d3748', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer' };
const btnDanger = { background: '#e53e3e', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer' };
const btnSuccessFull = { background: '#38a169', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', width: '100%', cursor: 'pointer', fontWeight: 'bold' };
const overlayS = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 };
const modalS = { background: 'white', padding: '20px', borderRadius: '15px', width: '400px' };
const recipeListItem = { padding: '10px', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' };