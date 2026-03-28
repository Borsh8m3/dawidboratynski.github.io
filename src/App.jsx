import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  const [activeModal, setActiveModal] = useState(null); 
  const [selectedCell, setSelectedCell] = useState(null);
  const [viewingRecipe, setViewingRecipe] = useState(null);
  const [filterCategory, setFilterCategory] = useState(''); 
  const [recipeListCategory, setRecipeListCategory] = useState('Obiad');

  const [newProd, setNewProd] = useState({ id: null, name: '', price: '', amount: '', unit: 'kg' });
  const [newRecipe, setNewRecipe] = useState({ id: null, name: '', category: 'Obiad', instructions: '', ingredients: [] });
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = useCallback(() => supabase.auth.signOut(), []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
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

  const weekDates = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) + (weekOffset * 7);
    return DAYS.map((name, i) => {
      const d = new Date(new Date().setDate(diff + i));
      return { name, fullDate: d.toISOString().split('T')[0], displayDate: d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) };
    });
  }, [weekOffset]);

  // --- LOGIKA ANALITYKI (SUMOWANIE ZAKUPÓW) ---
  const weeklyStats = useMemo(() => {
    const shoppingList = {};
    const dailyCosts = {};
    let grandTotal = 0;

    weekDates.forEach(dateObj => {
      const dayMeals = mealPlan.filter(m => m.date === dateObj.fullDate);
      let dayCost = 0;

      dayMeals.forEach(meal => {
        const fullRecipe = recipes.find(r => r.id === meal.recipe_id);
        if (fullRecipe) {
          dayCost += parseFloat(fullRecipe.total_cost);
          fullRecipe.recipe_ingredients?.forEach(ri => {
            const p = ri.products;
            if (!shoppingList[p.id]) {
              shoppingList[p.id] = { name: p.name, amount: 0, unit: p.unit, cost: 0, pricePerUnit: p.price_per_unit };
            }
            shoppingList[p.id].amount += parseFloat(ri.amount);
          });
        }
      });
      dailyCosts[dateObj.fullDate] = dayCost.toFixed(2);
      grandTotal += dayCost;
    });

    return { shoppingList: Object.values(shoppingList), dailyCosts, grandTotal: grandTotal.toFixed(2) };
  }, [weekDates, mealPlan, recipes]);

  // --- HANDLERS ---
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

  if (loading) return <div style={loadingStyle}>Ładowanie danych...</div>;
  if (!session) return <LoginView />;

  return (
    <div style={appContainer}>
      {/* HEADER */}
      <header style={isMobile ? headerMobile : headerStyle}>
        <div>
          <h1 style={{margin: 0, color: '#10b981'}}>🍴 Smart Planer</h1>
          <p style={{color: '#94a3b8'}}>{weekDates[0].displayDate} - {weekDates[6].displayDate}</p>
        </div>
        <div style={navButtons}>
          <button onClick={() => setWeekOffset(prev => prev - 1)} style={btnDark}>⬅</button>
          <button onClick={() => setWeekOffset(0)} style={btnDark}>Dziś</button>
          <button onClick={() => setWeekOffset(prev => prev + 1)} style={btnDark}>➡</button>
          <button onClick={() => setActiveModal('product')} style={btnSec}>📦 Produkty</button>
          <button onClick={() => setActiveModal('recipe')} style={btnPrim}>👨‍🍳 Przepisy</button>
          <button onClick={handleLogout} style={btnDanger}>Wyloguj</button>
        </div>
      </header>

      {/* GŁÓWNY UKŁAD: KALENDARZ + KOSZTY DZIENNE */}
      <div style={layoutGrid}>
        <div style={isMobile ? mobileStack : gridStyle}>
          {!isMobile && <div />}
          {!isMobile && MEAL_TYPES.map(m => <div key={m} style={mealHeader}>{m}</div>)}
          
          {weekDates.map(day => (
            <React.Fragment key={day.fullDate}>
              <div style={isMobile ? mobileDayLabel : dayCell}>
                <b>{day.name}</b><br/><small>{day.displayDate}</small>
                {isMobile && <div style={{fontSize: '12px', color: '#10b981'}}>{weeklyStats.dailyCosts[day.fullDate]} zł</div>}
              </div>
              {MEAL_TYPES.map(type => {
                const meal = mealPlan.find(p => p.date === day.fullDate && p.meal_type === type);
                return (
                  <div key={`${day.fullDate}-${type}`} style={meal ? cellStyleActive : cellStyle} onClick={() => { 
                    if(!meal) { setSelectedCell({ date: day.fullDate, type }); setFilterCategory(type); setActiveModal('cell'); }
                  }}>
                    {isMobile && <span style={mobileMealTag}>{type}</span>}
                    {meal ? (
                      <div style={mealContent}>
                        <div style={mealNameS}>{meal.recipes.name}</div>
                        <div style={mealPriceS}>{meal.recipes.total_cost} zł</div>
                        <button style={btnViewS} onClick={(e) => { e.stopPropagation(); setViewingRecipe(meal.recipes); setActiveModal('view-recipe'); }}>Pokaż</button>
                        <button style={btnDeleteSmall} onClick={async (e) => { e.stopPropagation(); if(confirm("Usunąć?")) { await supabase.from('meal_plan').delete().eq('id', meal.id); fetchData(); } }}>✕</button>
                      </div>
                    ) : <span style={{opacity: 0.1, fontSize: '20px'}}>+</span>}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* BOCZNY PANEL: KOSZTY DZIENNE (Tylko Desktop) */}
        {!isMobile && (
          <div style={sidePanel}>
            <h3 style={{marginTop: 0, color: '#10b981'}}>💰 Koszty dzienne</h3>
            {weekDates.map(day => (
              <div key={day.fullDate} style={sideRow}>
                <span>{day.name}</span>
                <b style={{color: '#10b981'}}>{weeklyStats.dailyCosts[day.fullDate]} zł</b>
              </div>
            ))}
            <div style={{...sideRow, border: 'none', marginTop: '10px', fontSize: '18px'}}>
              <span>Razem:</span>
              <b style={{color: '#10b981'}}>{weeklyStats.grandTotal} zł</b>
            </div>
          </div>
        )}
      </div>

      {/* DOLNY PANEL: LISTA ZAKUPÓW TYGODNIOWA */}
      <div style={shoppingPanel}>
        <h3 style={{color: '#10b981'}}>🛒 Potrzebne produkty (cały tydzień)</h3>
        <div style={shoppingGrid}>
          {weeklyStats.shoppingList.length > 0 ? weeklyStats.shoppingList.map(item => {
            const displayAmount = (item.unit === 'kg' && item.amount < 1000) ? `${item.amount} g` :
                                (item.unit === 'kg') ? `${(item.amount/1000).toFixed(2)} kg` :
                                (item.unit === 'l' && item.amount < 1000) ? `${item.amount} ml` :
                                (item.unit === 'l') ? `${(item.amount/1000).toFixed(2)} l` : `${item.amount} szt`;
            
            const itemCost = (item.unit === 'kg' || item.unit === 'l') ? (item.pricePerUnit * (item.amount/1000)) : (item.pricePerUnit * item.amount);

            return (
              <div key={item.name} style={shoppingItem}>
                <div style={{fontWeight: 'bold'}}>{item.name}</div>
                <div style={{color: '#94a3b8', fontSize: '13px'}}>{displayAmount} • {itemCost.toFixed(2)} zł</div>
              </div>
            );
          }) : <p style={{color: '#64748b'}}>Dodaj posiłki do planu, aby zobaczyć listę zakupów.</p>}
        </div>
      </div>

      {/* --- MODALE --- */}
      {/* MODAL: PRZEPISY (NAPRAWIONY I ROZBUDOWANY) */}
      {activeModal === 'recipe' && (
        <Modal title="👨‍🍳 Zarządzanie Przepisami" onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={{maxHeight: '75vh', overflowY: 'auto'}}>
            <div style={formBoxS}>
              <input style={inputS} placeholder="Nazwa dania..." value={newRecipe.name} onChange={e => setNewRecipe({...newRecipe, name: e.target.value})} />
              <select style={inputS} value={newRecipe.category} onChange={e => setNewRecipe({...newRecipe, category: e.target.value})}>{MEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
              <textarea style={{...inputS, height:'60px'}} placeholder="Opis przygotowania..." value={newRecipe.instructions} onChange={e => setNewRecipe({...newRecipe, instructions: e.target.value})} />
              <input style={inputS} placeholder="🔍 Szukaj składnika..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
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
                  <input type="number" style={{width:'50px', background: '#1e293b', border: '1px solid #334155', color: 'white'}} value={ing.amount} onChange={e => {
                    const copy = [...newRecipe.ingredients];
                    copy[idx].amount = e.target.value;
                    setNewRecipe({...newRecipe, ingredients: copy});
                  }} />
                  <button onClick={() => setNewRecipe({...newRecipe, ingredients: newRecipe.ingredients.filter((_, i) => i !== idx)})} style={{border:'none', background:'none', color:'#ef4444'}}>✕</button>
                </div>
              ))}
              <div style={{textAlign:'right', fontWeight:'bold', margin:'10px 0'}}>Suma: {recipeTotal} zł</div>
              <button style={btnSuccessFull} onClick={handleSaveRecipe}>Zapisz Przepis</button>
            </div>

            <h4 style={{color: '#10b981'}}>📋 Twoje Przepisy</h4>
            <div style={filterBar}>
              {MEAL_TYPES.map(cat => (
                <button key={cat} onClick={() => setRecipeListCategory(cat)} style={recipeListCategory === cat ? btnFilterActive : btnFilter}>{cat}</button>
              ))}
            </div>
            {recipes.filter(r => r.category === recipeListCategory).map(r => (
              <div key={r.id} style={productRowS}>
                <span>{r.name} ({r.total_cost} zł)</span>
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

      {/* POZOSTAŁE MODALE (Logika bez zmian, tylko style ciemne) */}
      {activeModal === 'cell' && (
        <Modal title="Wybierz posiłek" onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={filterBar}>{["Wszystkie", ...MEAL_TYPES].map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat === "Wszystkie" ? "" : cat)} style={filterCategory === (cat === "Wszystkie" ? "" : cat) ? btnFilterActive : btnFilter}>{cat}</button>
          ))}</div>
          <div style={{maxHeight: '300px', overflowY: 'auto'}}>
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
                  <span>{p.name} ({p.price_per_unit.toFixed(2)}zł/{p.unit})</span>
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={() => setNewProd({id:p.id, name:p.name, price:(p.price_per_unit*(p.last_input_quantity||1)).toFixed(2), amount:p.last_input_quantity||1, unit:p.unit})} style={iconBtn}>✏️</button>
                    <button onClick={async () => { if(confirm("Usunąć?")) { await supabase.from('products').delete().eq('id', p.id); fetchData(); } }} style={iconBtn}>🗑️</button>
                  </div>
                </div>
              ))}
           </div>
        </Modal>
      )}
      
      {activeModal === 'view-recipe' && viewingRecipe && (
        <Modal title={`📖 ${viewingRecipe.name}`} onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={{maxHeight: '70vh', overflowY: 'auto'}}>
            <p style={{whiteSpace: 'pre-wrap', background: '#1e293b', padding: '15px', borderRadius: '10px', fontSize: '14px'}}>{viewingRecipe.instructions || "Brak opisu przygotowania."}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- LOGIN VIEW ---
function LoginView() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const handleLogin = async (e) => { e.preventDefault(); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) alert(error.message); };
  return (
    <div style={loginOverlay}><form onSubmit={handleLogin} style={loginForm}><h2 style={{color:'#10b981'}}>🔐 Meal planer</h2><input style={inputS} type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} /><input style={inputS} type="password" placeholder="Hasło" onChange={e => setPassword(e.target.value)} /><button style={btnSuccessFull}>Zaloguj</button></form></div>
  );
}

function Modal({ title, children, onClose, isMobile }) {
  const mS = { background: '#0f172a', padding: isMobile ? '15px' : '25px', borderRadius: '20px', width: isMobile ? '90%' : '550px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', color: 'white', border: '1px solid #1e293b' };
  return (<div style={overlayS}><div style={mS}><div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px'}}><h3 style={{margin:0}}>{title}</h3><button onClick={onClose} style={{border:'none', background:'none', cursor:'pointer', fontSize:'24px', color:'white'}}>✕</button></div>{children}</div></div>);
}

// --- STYLE (DARK MODE & GRID) ---
const appContainer = { padding: '15px', backgroundColor: '#020617', minHeight: '100vh', color: '#f1f5f9', fontFamily: 'sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: '#0f172a', padding: '20px', borderRadius: '15px', border: '1px solid #1e293b' };
const headerMobile = { display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', background: '#0f172a', padding: '20px', borderRadius: '15px', textAlign: 'center' };
const navButtons = { display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' };
const layoutGrid = { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' };
const sidePanel = { background: '#0f172a', padding: '20px', borderRadius: '15px', border: '1px solid #1e293b', height: 'fit-content' };
const sideRow = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1e293b' };
const gridStyle = { display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)', gap: '10px' };
const mobileStack = { display: 'flex', flexDirection: 'column', gap: '15px' };
const dayCell = { background: '#0f172a', padding: '12px', borderRadius: '12px', textAlign: 'center', borderLeft: '5px solid #10b981' };
const mobileDayLabel = { background: '#10b981', color: 'white', padding: '12px', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' };
const mealHeader = { textAlign: 'center', fontWeight: 'bold', color: '#94a3b8', padding: '10px' };
const cellStyle = { minHeight: '100px', background: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' };
const cellStyleActive = { ...cellStyle, border: '2px solid #10b981' };
const mealContent = { width: '100%', textAlign: 'center', padding: '10px' };
const mealNameS = { fontWeight: 'bold', fontSize: '13px', color: '#f1f5f9' };
const mealPriceS = { fontSize: '12px', color: '#10b981', fontWeight: 'bold' };
const btnViewS = { background: '#1e293b', color: '#f1f5f9', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '10px', cursor: 'pointer', marginTop: '8px' };
const btnDeleteSmall = { position: 'absolute', top: '5px', right: '5px', background: '#450a0a', border: 'none', color: '#f87171', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer' };
const mobileMealTag = { position: 'absolute', top: '5px', left: '8px', fontSize: '9px', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' };
const shoppingPanel = { marginTop: '30px', background: '#0f172a', padding: '25px', borderRadius: '15px', border: '1px solid #1e293b' };
const shoppingGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' };
const shoppingItem = { background: '#1e293b', padding: '15px', borderRadius: '10px', border: '1px solid #334155' };
const inputS = { width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '10px', background: '#1e293b', border: '1px solid #334155', color: 'white' };
const btnPrim = { background: '#10b981', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' };
const btnSec = { background: '#1e293b', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer' };
const btnDark = { background: '#1e293b', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '10px' };
const btnDanger = { background: '#7f1d1d', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px' };
const btnSuccessFull = { background: '#10b981', color: 'white', border: 'none', padding: '15px', borderRadius: '12px', width: '100%', cursor: 'pointer', fontWeight: 'bold' };
const btnFilter = { background: '#1e293b', color: '#94a3b8', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', marginRight: '5px' };
const btnFilterActive = { ...btnFilter, background: '#10b981', color: 'white' };
const filterBar = { display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto' };
const productRowS = { display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#1e293b', borderRadius: '10px', marginBottom: '8px' };
const recipeListItem = { padding: '15px', borderBottom: '1px solid #1e293b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '14px' };
const searchResultsS = { background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', marginTop: '-5px', marginBottom: '15px' };
const searchItemS = { padding: '12px', cursor: 'pointer', borderBottom: '1px solid #334155' };
const ingRowS = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', alignItems: 'center' };
const iconBtn = { border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' };
const overlayS = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const loginOverlay = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#020617' };
const loginForm = { background: '#0f172a', padding: '40px', borderRadius: '25px', width: '320px', border: '1px solid #1e293b' };
const loadingStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#10b981' };