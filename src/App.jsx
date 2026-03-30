import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// --- KONFIGURACJA SUPABASE ---
const SUPABASE_URL = 'TWÓJ_URL';
const SUPABASE_ANON_KEY = 'TWÓJ_KLUCZ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MEAL_TYPES = ['Śniadanie', 'II Śniadanie', 'Obiad', 'Podwieczorek', 'Kolacja'];
const DAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [mealPlan, setMealPlan] = useState([]);
  const [activeModal, setActiveModal] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [selectedCell, setSelectedCell] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Nowy stan dla listy zakupów
  const [shoppingList, setShoppingList] = useState([]);

  // Formularze
  const [newRecipe, setNewRecipe] = useState({ name: '', category: '', ingredients: [], is_favorite: false });
  const [newProd, setNewProd] = useState({ name: '', price: '', amount: '', unit: 'g' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    window.addEventListener('resize', () => setIsMobile(window.innerWidth < 768));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  const fetchData = async () => {
    const { data: r } = await supabase.from('recipes').select('*');
    const { data: p } = await supabase.from('products').select('*');
    const { data: m } = await supabase.from('meal_plan').select('*');
    setRecipes(r || []);
    setProducts(p || []);
    setMealPlan(m || []);
  };

  const handleSaveProduct = async () => {
    const pricePerUnit = parseFloat(newProd.price) / parseFloat(newProd.amount);
    const payload = {
      name: newProd.name,
      price_per_unit: pricePerUnit,
      unit: newProd.unit,
      last_input_quantity: parseFloat(newProd.amount),
    };
    if (newProd.id) {
      await supabase.from('products').update(payload).eq('id', newProd.id);
    } else {
      await supabase.from('products').insert([payload]);
    }
    setNewProd({ name: '', price: '', amount: '', unit: 'g' });
    fetchData();
  };

  const addToShoppingList = (ing) => {
    setShoppingList(prev => [...prev, { ...ing, id: Date.now() + Math.random() }]);
  };

  const addAllToShoppingList = (ingredients) => {
    const newItems = ingredients.map(ing => ({ ...ing, id: Date.now() + Math.random() }));
    setShoppingList(prev => [...prev, ...newItems]);
  };

  if (loading) return <div style={loadingStyle}>Ładowanie...</div>;
  if (!session) return <LoginView />;

  return (
    <div style={appContainer}>
      <header style={isMobile ? headerMobile : headerStyle}>
        <h1>Jedzonko P</h1>
        <div style={navButtons}>
          <button style={btnPrim} onClick={() => setActiveModal('recipe')}>+ Przepis</button>
          <button style={btnSec} onClick={() => setActiveModal('product')}>Produkty</button>
          <button style={btnStats} onClick={() => setActiveModal('shopping')}>Lista Zakupów</button>
          <button style={btnDanger} onClick={() => supabase.auth.signOut()}>Wyloguj</button>
        </div>
      </header>

      <div style={layoutGrid}>
        <div style={isMobile ? mobileStack : gridStyle}>
          {!isMobile && <div />} 
          {!isMobile && MEAL_TYPES.map(t => <div key={t} style={mealHeader}>{t}</div>)}

          {DAYS.map(day => (
            <React.Fragment key={day}>
              {isMobile ? (
                <div style={mobileDayLabel}>{day}</div>
              ) : (
                <div style={dayCell}>{day}</div>
              )}
              {MEAL_TYPES.map(type => {
                const meal = mealPlan.find(m => m.date === day && m.meal_type === type);
                const recipe = meal ? recipes.find(r => r.id === meal.recipe_id) : null;

                return (
                  <div 
                    key={type} 
                    style={meal ? cellStyleActive : cellStyle}
                    onClick={() => {
                      setSelectedCell({ date: day, type });
                      setActiveModal('cell');
                    }}
                  >
                    {isMobile && <span style={mobileMealTag}>{type}</span>}
                    {recipe ? (
                      <div style={mealContent}>
                        <div style={mealNameS}>
                          {recipe.is_favorite && '⭐ '}
                          {recipe.name}
                        </div>
                        <div style={mealPriceS}>{recipe.total_cost} zł</div>
                        <button 
                          style={btnDeleteSmall} 
                          onClick={async (e) => {
                            e.stopPropagation();
                            await supabase.from('meal_plan').delete().eq('id', meal.id);
                            fetchData();
                          }}
                        >✕</button>
                      </div>
                    ) : <span>+</span>}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        <div style={sidePanel}>
          <h3>Podsumowanie tygodnia</h3>
          <div style={sideRow}>
            <span>Suma:</span>
            <b>{mealPlan.reduce((acc, m) => {
              const r = recipes.find(rec => rec.id === m.recipe_id);
              return acc + (r?.total_cost || 0);
            }, 0).toFixed(2)} zł</b>
          </div>
        </div>
      </div>

      {/* MODAL: PRZEPISY */}
      {activeModal === 'recipe' && (
        <Modal title="Nowy Przepis" onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={formBoxS}>
            <input 
              style={inputS} 
              placeholder="Nazwa przepisu" 
              value={newRecipe.name}
              onChange={e => setNewRecipe({...newRecipe, name: e.target.value})}
            />
            <select 
              style={inputS}
              value={newRecipe.category}
              onChange={e => setNewRecipe({...newRecipe, category: e.target.value})}
            >
              <option value="">Wybierz kategorię</option>
              {MEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
               <label>Ulubione:</label>
               <input 
                type="checkbox" 
                checked={newRecipe.is_favorite} 
                onChange={e => setNewRecipe({...newRecipe, is_favorite: e.target.checked})}
               />
            </div>
          </div>
          <button style={btnSuccessFull} onClick={async () => {
            const total = newRecipe.ingredients.reduce((acc, i) => acc + (i.price || 0), 0);
            await supabase.from('recipes').insert([{ ...newRecipe, total_cost: total }]);
            setActiveModal(null);
            setNewRecipe({ name: '', category: '', ingredients: [], is_favorite: false });
            fetchData();
          }}>Zapisz Przepis</button>
        </Modal>
      )}

      {/* MODAL: PRODUKTY */}
      {activeModal === 'product' && (
        <Modal title="Baza Produktów" onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={formBoxS}>
            <input style={inputS} placeholder="Nazwa" value={newProd.name} onChange={e => setNewProd({...newProd, name: e.target.value})} />
            <div style={{ display: 'flex', gap: '5px' }}>
              <input style={inputS} placeholder="Cena" type="number" value={newProd.price} onChange={e => setNewProd({...newProd, price: e.target.value})} />
              <input style={inputS} placeholder="Ilość" type="number" value={newProd.amount} onChange={e => setNewProd({...newProd, amount: e.target.value})} />
              <select style={inputS} value={newProd.unit} onChange={e => setNewProd({...newProd, unit: e.target.value})}>
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="szt">szt</option>
              </select>
            </div>
            <button style={btnSuccessFull} onClick={handleSaveProduct}>Zapisz</button>
          </div>
          <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
            {products.map(p => (
              <div key={p.id} style={productRowS}>
                <span>{p.name} ({p.price_per_unit.toFixed(2)})</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setNewProd({
                    id: p.id, name: p.name, price: (p.price_per_unit * (p.last_input_quantity || 1)).toFixed(2),
                    amount: p.last_input_quantity || 1, unit: p.unit
                  })} style={iconBtn}>✏️</button>
                  <button onClick={async () => {
                    if (confirm('Usunąć?')) {
                      await supabase.from('products').delete().eq('id', p.id);
                      fetchData();
                    }
                  }} style={iconBtn}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* MODAL: DODAWANIE DO PLANU */}
      {activeModal === 'cell' && (
        <Modal title="Dodaj do planu" onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={filterBar}>
            {['Wszystkie', ...MEAL_TYPES].map(cat => (
              <button 
                key={cat} 
                onClick={() => setFilterCategory(cat === 'Wszystkie' ? '' : cat)}
                style={filterCategory === (cat === 'Wszystkie' ? '' : cat) ? btnFilterActive : btnFilter}
              >{cat}</button>
            ))}
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {recipes
              .filter(r => !filterCategory || r.category === filterCategory)
              .sort((a, b) => b.is_favorite - a.is_favorite)
              .map(r => (
                <div key={r.id} style={recipeListItem} onClick={async () => {
                  await supabase.from('meal_plan').insert([{
                    date: selectedCell.date, meal_type: selectedCell.type, recipe_id: r.id
                  }]);
                  setActiveModal(null);
                  fetchData();
                }}>
                  <span>{r.is_favorite && '⭐ '}{r.name}</span>
                  <b>{r.total_cost} zł</b>
                </div>
              ))}
          </div>
        </Modal>
      )}

      {/* MODAL: LISTA ZAKUPÓW (NOWA FUNKCJONALNOŚĆ) */}
      {activeModal === 'shopping' && (
        <Modal title="Lista Zakupów" onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
            <h4 style={{ marginBottom: '10px' }}>Składniki z planu:</h4>
            {mealPlan.length === 0 && <p>Zaplanuj posiłki, aby zobaczyć składniki.</p>}
            
            {mealPlan.map((item) => {
              const recipe = recipes.find(r => r.id === item.recipe_id);
              if (!recipe || !recipe.ingredients) return null;
              
              return (
                <div key={item.id} style={statSection}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '14px' }}>{recipe.name} ({item.date})</strong>
                    <button 
                      style={{ ...btnViewS, background: '#3b82f6', marginTop: 0 }}
                      onClick={() => addAllToShoppingList(recipe.ingredients)}
                    >
                      + Wszystko
                    </button>
                  </div>
                  {recipe.ingredients.map((ing, idx) => (
                    <div key={idx} style={ingRowS}>
                      <span style={{ fontSize: '13px' }}>- {ing.name}: {ing.amount} {ing.unit}</span>
                      <button 
                        onClick={() => addToShoppingList(ing)}
                        style={{ ...iconBtn, color: '#059669', fontSize: '14px' }}
                      >
                        ➕
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{ marginTop: '20px', padding: '15px', background: '#fff', border: '2px solid #059669', borderRadius: '15px' }}>
              <h3 style={{ marginTop: 0 }}>Do kupienia:</h3>
              {shoppingList.length === 0 && <p style={{ color: '#94a3b8' }}>Lista jest pusta.</p>}
              <div style={shoppingGrid}>
                {shoppingList.map((item) => (
                  <div key={item.id} style={shoppingItem}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{item.amount} {item.unit}</div>
                    </div>
                    <button 
                      style={btnDeleteSmall}
                      onClick={() => setShoppingList(shoppingList.filter(i => i.id !== item.id))}
                    >✕</button>
                  </div>
                ))}
              </div>
              {shoppingList.length > 0 && (
                <button 
                  style={{ ...btnDanger, width: '100%', marginTop: '15px' }}
                  onClick={() => setShoppingList([])}
                >Wyczyść listę</button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- LOGIN VIEW ---
function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };
  return (
    <div style={loginOverlay}>
      <form onSubmit={handleLogin} style={loginForm}>
        <h2>Jedzonko P</h2>
        <input style={inputS} type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} />
        <input style={inputS} type="password" placeholder="Hasło" onChange={e => setPassword(e.target.value)} />
        <button style={btnSuccessFull}>Zaloguj</button>
      </form>
    </div>
  );
}

function Modal({ title, children, onClose, isMobile }) {
  const mS = {
    background: 'white',
    padding: isMobile ? '15px' : '25px',
    borderRadius: '20px',
    width: isMobile ? '90%' : '550px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
    zIndex: 1100,
    position: 'relative',
  };
  return (
    <div style={overlayS}>
      <div style={mS}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
          <h3>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '28px', cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --- STYLE ---
const appContainer = { padding: '20px', backgroundColor: '#f3f4f6', minHeight: '100vh', fontFamily: 'sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'white', padding: '20px', borderRadius: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const headerMobile = { display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', background: 'white', padding: '20px', borderRadius: '15px', textAlign: 'center' };
const navButtons = { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' };
const layoutGrid = { display: 'grid', gridTemplateColumns: window.innerWidth < 900 ? '1fr' : '1fr 280px', gap: '20px' };
const sidePanel = { background: 'white', padding: '20px', borderRadius: '15px', height: 'fit-content', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const sideRow = { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' };
const gridStyle = { display: 'grid', gridTemplateColumns: '110px repeat(5, 1fr)', gap: '10px' };
const mobileStack = { display: 'flex', flexDirection: 'column', gap: '12px' };
const dayCell = { background: 'white', padding: '12px', borderRadius: '12px', textAlign: 'center', borderLeft: '5px solid #059669', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const mobileDayLabel = { background: '#059669', color: 'white', padding: '12px', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' };
const mealHeader = { textAlign: 'center', fontWeight: 'bold', color: '#64748b' };
const cellStyle = { minHeight: '100px', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden' };
const cellStyleActive = { ...cellStyle, border: '2px solid #059669' };
const mealContent = { width: '100%', textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' };
const mealNameS = { fontWeight: 'bold', fontSize: '13px' };
const mealPriceS = { fontSize: '12px', color: '#059669', fontWeight: 'bold' };
const btnViewS = { background: '#059669', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '10px', cursor: 'pointer', marginTop: '8px' };
const btnDeleteSmall = { position: 'absolute', top: '5px', right: '5px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer' };
const shoppingGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' };
const shoppingItem = { background: '#f9fafb', padding: '10px', borderRadius: '12px', border: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const inputS = { width: '100%', padding: '10px', marginBottom: '5px', borderRadius: '10px', border: '1px solid #d1d5db', boxSizing: 'border-box' };
const btnPrim = { background: '#059669', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' };
const btnSec = { background: '#f3f4f6', color: '#374151', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer' };
const btnStats = { background: '#3182ce', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' };
const btnDanger = { background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer' };
const btnSuccessFull = { background: '#059669', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', width: '100%', cursor: 'pointer', fontWeight: 'bold' };
const btnFilter = { background: '#f3f4f6', color: '#6b7280', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer' };
const btnFilterActive = { ...btnFilter, background: '#059669', color: 'white' };
const filterBar = { display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto' };
const productRowS = { display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #f3f4f6', alignItems: 'center' };
const recipeListItem = { padding: '15px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' };
const ingRowS = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', alignItems: 'center', borderBottom: '1px dashed #e2e8f0' };
const iconBtn = { border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' };
const overlayS = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const loginOverlay = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f3f4f6' };
const loginForm = { background: 'white', padding: '40px', borderRadius: '25px', width: '320px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' };
const loadingStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#059669', fontSize: '20px' };
const mobileMealTag = { position: 'absolute', top: '5px', left: '8px', fontSize: '9px', color: '#94a3b8', fontWeight: 'bold' };
const formBoxS = { background: '#f9fafb', padding: '15px', borderRadius: '15px', marginBottom: '20px', border: '1px solid #e5e7eb' };
const statSection = { marginBottom: '15px', padding: '12px', background: '#f8fafc', borderRadius: '15px', border: '1px solid #e2e8f0' };