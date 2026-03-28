import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const MEAL_TYPES = ["Śniadanie", "Lunch", "Obiad", "Podwieczorek", "Kolacja"];
const DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [mealPlan, setMealPlan] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 850);

  // Modale i stany
  const [activeModal, setActiveModal] = useState(null); 
  const [selectedCell, setSelectedCell] = useState(null);
  const [viewingRecipe, setViewingRecipe] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [recipeListCategory, setRecipeListCategory] = useState('Obiad');

  const [newProd, setNewProd] = useState({ id: null, name: '', price: '', amount: '', unit: 'kg' });
  const [newRecipe, setNewRecipe] = useState({ id: null, name: '', category: 'Obiad', instructions: '', ingredients: [] });
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = useCallback(() => supabase.auth.signOut(), []);

  // Śledzenie szerokości ekranu
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 850);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); setLoading(false); });
    return () => subscription.unsubscribe();
  }, [handleLogout]);

  useEffect(() => { if (session) fetchData(); }, [session, weekOffset]);

  async function fetchData() {
    const { data: prods } = await supabase.from('products').select('*').order('name');
    const { data: recs } = await supabase.from('recipes').select('*, recipe_ingredients(*, products(*))').order('name');
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

  const handleSaveProduct = async () => {
    const pricePerBaseUnit = parseFloat(newProd.price) / parseFloat(newProd.amount);
    const prodData = { name: newProd.name, price_per_unit: pricePerBaseUnit, unit: newProd.unit, last_input_quantity: parseFloat(newProd.amount) };
    if (newProd.id) await supabase.from('products').update(prodData).eq('id', newProd.id);
    else await supabase.from('products').insert([prodData]);
    setNewProd({ id: null, name: '', price: '', amount: '', unit: 'kg' });
    fetchData();
  };

  const handleSaveRecipe = async () => {
    const calcPrice = (ing) => {
      const p = parseFloat(ing.price_per_unit || ing.products?.price_per_unit || 0);
      const a = parseFloat(ing.amount || 0);
      const unit = ing.unit || ing.products?.unit;
      return (unit === 'kg' || unit === 'l') ? (p * (a / 1000)) : (p * a);
    };
    const total = newRecipe.ingredients.reduce((sum, i) => sum + calcPrice(i), 0).toFixed(2);
    const recipeData = { name: newRecipe.name, category: newRecipe.category, total_cost: total, instructions: newRecipe.instructions };
    
    let recipeId = newRecipe.id;
    if (newRecipe.id) {
      await supabase.from('recipes').update(recipeData).eq('id', newRecipe.id);
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', newRecipe.id);
    } else {
      const { data } = await supabase.from('recipes').insert([recipeData]).select().single();
      recipeId = data.id;
    }
    const ingredientsToInsert = newRecipe.ingredients.map(ing => ({ recipe_id: recipeId, product_id: ing.id || ing.product_id, amount: ing.amount }));
    await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
    setNewRecipe({ id: null, name: '', category: 'Obiad', instructions: '', ingredients: [] });
    setActiveModal(null);
    fetchData();
  };

  if (loading) return <div style={loadingStyle}>Ładowanie...</div>;
  if (!session) return <LoginView />;

  return (
    <div style={appContainer}>
      {/* HEADER */}
      <header style={isMobile ? headerMobile : headerStyle}>
        <div style={{textAlign: isMobile ? 'center' : 'left'}}>
          <h1 style={{margin: 0, fontSize: isMobile ? '20px' : '28px'}}>🍴 Smart Planer</h1>
          <p style={{margin: '5px 0', fontSize: '14px', color: '#64748b'}}>{getWeekDates()[0].displayDate} - {getWeekDates()[6].displayDate}</p>
        </div>
        <div style={isMobile ? navButtonsMobile : navButtons}>
          <div style={{display: 'flex', gap: '5px', width: '100%', justifyContent: 'center'}}>
            <button onClick={() => setWeekOffset(prev => prev - 1)} style={btnSmall}>⬅</button>
            <button onClick={() => setWeekOffset(0)} style={btnSmall}>Dziś</button>
            <button onClick={() => setWeekOffset(prev => prev + 1)} style={btnSmall}>➡</button>
          </div>
          <div style={{display: 'flex', gap: '5px', width: '100%', justifyContent: 'center'}}>
            <button onClick={() => setActiveModal('product')} style={btnSecSmall}>📦 Spiżarnia</button>
            <button onClick={() => setActiveModal('recipe')} style={btnPrimSmall}>👨‍🍳 Przepisy</button>
            <button onClick={handleLogout} style={btnDangerSmall}>Wyloguj</button>
          </div>
        </div>
      </header>

      {/* KALENDARZ RESPONSIVE */}
      <div style={isMobile ? mobileStack : gridStyle}>
        {!isMobile && <div />}
        {!isMobile && MEAL_TYPES.map(m => <div key={m} style={mealHeader}>{m}</div>)}
        
        {getWeekDates().map(day => (
          <React.Fragment key={day.fullDate}>
            <div style={isMobile ? mobileDayLabel : dayCell}>
              <b>{day.name}</b><br/>
              <small>{day.displayDate}</small>
            </div>
            {MEAL_TYPES.map(type => {
              const meal = mealPlan.find(p => p.date === day.fullDate && p.meal_type === type);
              return (
                <div key={`${day.fullDate}-${type}`} style={meal ? cellStyleActive : cellStyle} onClick={() => { 
                  if(!meal) { setSelectedCell({ date: day.fullDate, type }); setFilterCategory(type); setActiveModal('cell'); }
                }}>
                  {isMobile && <span style={mobileMealTag}>{type}:</span>}
                  {meal ? (
                    <div style={mealContent}>
                      <div style={mealNameS}>{meal.recipes.name}</div>
                      <div style={mealPriceS}>{meal.recipes.total_cost} zł</div>
                      <button style={btnViewS} onClick={(e) => { e.stopPropagation(); setViewingRecipe(meal.recipes); setActiveModal('view-recipe'); }}>Pokaż</button>
                      <button style={btnDeleteSmall} onClick={async (e) => { e.stopPropagation(); if(confirm("Usunąć z planu?")) { await supabase.from('meal_plan').delete().eq('id', meal.id); fetchData(); } }}>✕</button>
                    </div>
                  ) : <span style={{opacity: 0.2, fontSize: '20px'}}>+</span>}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* MODALE POZOSTAJĄ PODOBNE, ALE Z LEPSZYM DOPASOWANIEM SZEROKOŚCI */}
      {activeModal === 'cell' && (
        <Modal title={`Dodaj do: ${selectedCell?.type}`} onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={filterBar}>
            {["Wszystkie", ...MEAL_TYPES].map(cat => (
              <button key={cat} onClick={() => setFilterCategory(cat === "Wszystkie" ? "" : cat)} 
                style={filterCategory === (cat === "Wszystkie" ? "" : cat) ? btnFilterActive : btnFilter}>{cat}</button>
            ))}
          </div>
          <div style={{maxHeight: '350px', overflowY: 'auto'}}>
            {recipes.filter(r => !filterCategory || r.category === filterCategory).map(r => (
              <div key={r.id} style={recipeListItem} onClick={async () => {
                await supabase.from('meal_plan').insert([{ date: selectedCell.date, meal_type: selectedCell.type, recipe_id: r.id }]);
                setActiveModal(null); fetchData();
              }}>
                <span><b>[{r.category}]</b> {r.name}</span> <b>{r.total_cost} zł</b>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {activeModal === 'view-recipe' && viewingRecipe && (
        <Modal title={`📖 ${viewingRecipe.name}`} onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={{maxHeight: '70vh', overflowY: 'auto'}}>
            <p style={{whiteSpace: 'pre-wrap', background: '#f8fafc', padding: '15px', borderRadius: '10px', fontSize: '14px'}}>{viewingRecipe.instructions || "Brak opisu."}</p>
          </div>
        </Modal>
      )}

      {/* MODAL: SPIŻARNIA */}
      {activeModal === 'product' && (
        <Modal title="📦 Spiżarnia" onClose={() => setActiveModal(null)} isMobile={isMobile}>
           <div style={formBoxS}>
              <input style={inputS} placeholder="Nazwa" value={newProd.name} onChange={e => setNewProd({...newProd, name: e.target.value})} />
              <div style={{display:'flex', gap:'5px'}}>
                <input style={inputS} type="number" placeholder="Cena" value={newProd.price} onChange={e => setNewProd({...newProd, price: e.target.value})} />
                <input style={inputS} type="number" placeholder="Ilość" value={newProd.amount} onChange={e => setNewProd({...newProd, amount: e.target.value})} />
                <select style={inputS} value={newProd.unit} onChange={e => setNewProd({...newProd, unit: e.target.value})}><option value="kg">kg</option><option value="l">l</option><option value="szt">szt</option></select>
              </div>
              <button style={btnSuccessFull} onClick={handleSaveProduct}>{newProd.id ? 'Zaktualizuj' : 'Zapisz'}</button>
           </div>
           <div style={{maxHeight: '300px', overflowY: 'auto'}}>
              {products.map(p => (
                <div key={p.id} style={productRowS}>
                  <span style={{fontSize: '14px'}}>{p.name} ({p.price_per_unit.toFixed(2)}zł)</span>
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={() => setNewProd({id:p.id, name:p.name, price:(p.price_per_unit*(p.last_input_quantity||1)).toFixed(2), amount:p.last_input_quantity||1, unit:p.unit})} style={iconBtn}>✏️</button>
                    <button onClick={async () => { if(confirm("Usunąć?")) { await supabase.from('products').delete().eq('id', p.id); fetchData(); } }} style={iconBtn}>🗑️</button>
                  </div>
                </div>
              ))}
           </div>
        </Modal>
      )}

      {/* MODAL: PRZEPISY */}
      {activeModal === 'recipe' && (
        <Modal title="👨‍🍳 Zarządzanie Przepisami" onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={{maxHeight: '75vh', overflowY: 'auto'}}>
            <div style={formBoxS}>
              <input style={inputS} placeholder="Nazwa dania..." value={newRecipe.name} onChange={e => setNewRecipe({...newRecipe, name: e.target.value})} />
              <select style={inputS} value={newRecipe.category} onChange={e => setNewRecipe({...newRecipe, category: e.target.value})}>{MEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
              <textarea style={{...inputS, height:'60px'}} placeholder="Opis przygotowania..." value={newRecipe.instructions} onChange={e => setNewRecipe({...newRecipe, instructions: e.target.value})} />
              <input style={inputS} placeholder="🔍 Dodaj składnik..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && (
                <div style={searchResultsS}>
                  {products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(p => (
                    <div key={p.id} style={searchItemS} onClick={() => { setNewRecipe({...newRecipe, ingredients: [...newRecipe.ingredients, {...p, amount: p.unit==='szt'?1:100}]}); setSearchQuery(''); }}>{p.name}</div>
                  ))}
                </div>
              )}
              {newRecipe.ingredients.map((ing, idx) => (
                <div key={idx} style={ingRowS}>
                  <small>{ing.name}</small>
                  <input type="number" style={{width:'50px'}} value={ing.amount} onChange={e => {
                    const copy = [...newRecipe.ingredients];
                    copy[idx].amount = e.target.value;
                    setNewRecipe({...newRecipe, ingredients: copy});
                  }} />
                  <button onClick={() => setNewRecipe({...newRecipe, ingredients: newRecipe.ingredients.filter((_, i) => i !== idx)})} style={{border:'none', background:'none', color:'red'}}>✕</button>
                </div>
              ))}
              <div style={{textAlign:'right', fontWeight:'bold', margin:'10px 0'}}>Suma: {recipeTotal} zł</div>
              <button style={btnSuccessFull} onClick={handleSaveRecipe}>Zapisz</button>
            </div>
            <div style={filterBar}>
              {MEAL_TYPES.map(cat => (
                <button key={cat} onClick={() => setRecipeListCategory(cat)} style={recipeListCategory === cat ? btnFilterActive : btnFilter}>{cat}</button>
              ))}
            </div>
            {recipes.filter(r => r.category === recipeListCategory).map(r => (
              <div key={r.id} style={productRowS}>
                <span style={{fontSize:'13px'}}>{r.name}</span>
                <div style={{display:'flex', gap:'10px'}}>
                  <button onClick={() => {
                    setNewRecipe({ id: r.id, name: r.name, category: r.category, instructions: r.instructions, ingredients: r.recipe_ingredients.map(ri => ({ ...ri.products, amount: ri.amount, product_id: ri.product_id })) });
                  }} style={iconBtn}>✏️</button>
                  <button onClick={async () => { if(confirm("Usunąć?")) { await supabase.from('recipes').delete().eq('id', r.id); fetchData(); } }} style={iconBtn}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- HELPERS ---
function LoginView() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const handleLogin = async (e) => { e.preventDefault(); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) alert(error.message); };
  return (
    <div style={loginOverlay}><form onSubmit={handleLogin} style={loginForm}><h2>🔐 Smart Planer</h2><input style={inputS} type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} /><input style={inputS} type="password" placeholder="Hasło" onChange={e => setPassword(e.target.value)} /><button style={btnSuccessFull}>Zaloguj</button></form></div>
  );
}

function Modal({ title, children, onClose, isMobile }) {
  const mS = { background: 'white', padding: isMobile ? '15px' : '25px', borderRadius: '20px', width: isMobile ? '90%' : '500px', maxWidth: '500px', boxShadow: '0 15px 30px rgba(0,0,0,0.2)' };
  return (<div style={overlayS}><div style={mS}><div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}><h3 style={{margin:0, fontSize: isMobile ? '16px' : '20px'}}>{title}</h3><button onClick={onClose} style={{border:'none', background:'none', cursor:'pointer', fontSize:'24px'}}>✕</button></div>{children}</div></div>);
}

// --- STYLE ---
const appContainer = { padding: '10px', backgroundColor: '#f0f2f5', minHeight: '100vh', fontFamily: 'sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'white', padding: '15px', borderRadius: '15px' };
const headerMobile = { display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', background: 'white', padding: '15px', borderRadius: '15px' };
const navButtons = { display: 'flex', gap: '8px' };
const navButtonsMobile = { display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' };
const gridStyle = { display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)', gap: '10px' };
const mobileStack = { display: 'flex', flexDirection: 'column', gap: '15px' };
const dayCell = { background: 'white', padding: '12px', borderRadius: '12px', textAlign: 'center', borderLeft: '5px solid #38a169' };
const mobileDayLabel = { background: '#38a169', color: 'white', padding: '10px', borderRadius: '10px', textAlign: 'center', fontWeight: 'bold' };
const mealHeader = { textAlign: 'center', fontWeight: 'bold', color: '#4a5568' };
const cellStyle = { minHeight: '80px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', padding: '5px' };
const cellStyleActive = { ...cellStyle, border: '2px solid #38a169' };
const mobileMealTag = { position: 'absolute', top: '5px', left: '8px', fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' };
const mealContent = { width: '100%', textAlign: 'center', padding: '10px 5px 5px 5px' };
const mealNameS = { fontWeight: 'bold', fontSize: '12px', color: '#2d3748' };
const mealPriceS = { fontSize: '11px', color: '#38a169', fontWeight: 'bold' };
const btnViewS = { background: '#edf2f7', border: 'none', padding: '4px 8px', borderRadius: '5px', fontSize: '10px', cursor: 'pointer', marginTop: '5px' };
const btnDeleteSmall = { position: 'absolute', top: '2px', right: '2px', background: '#feb2b2', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', fontSize: '9px' };
const filterBar = { display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' };
const btnFilter = { background: '#edf2f7', border: 'none', padding: '8px 15px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' };
const btnFilterActive = { ...btnFilter, background: '#3182ce', color: 'white' };
const inputS = { width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '10px', border: '1px solid #ddd', boxSizing: 'border-box', fontSize: '14px' };
const btnSmall = { background: '#edf2f7', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', flex: 1 };
const btnPrimSmall = { background: '#3182ce', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', flex: 1, fontSize: '12px', fontWeight: 'bold' };
const btnSecSmall = { background: '#edf2f7', color: '#2d3748', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', flex: 1, fontSize: '12px' };
const btnDangerSmall = { background: '#e53e3e', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', flex: 1, fontSize: '12px' };
const btnSuccessFull = { background: '#38a169', color: 'white', border: 'none', padding: '14px', borderRadius: '10px', width: '100%', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };
const overlayS = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalS = { background: 'white', padding: '25px', borderRadius: '20px', width: '500px', boxShadow: '0 15px 30px rgba(0,0,0,0.2)' };
const formBoxS = { background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #e2e8f0' };
const productRowS = { display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #eee', alignItems: 'center' };
const iconBtn = { border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' };
const searchResultsS = { background: 'white', border: '1px solid #ddd', borderRadius: '8px', marginTop: '-5px', marginBottom: '10px' };
const searchItemS = { padding: '10px', cursor: 'pointer', borderBottom: '1px solid #eee' };
const ingRowS = { display: 'flex', justifyContent: 'space-between', padding: '5px 0', alignItems: 'center' };
const recipeListItem = { padding: '12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '13px' };
const loginOverlay = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f1f5f9' };
const loginForm = { background: 'white', padding: '30px', borderRadius: '25px', width: '300px' };
const loadingStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' };