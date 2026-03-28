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
  
  // NOWOŚĆ: Stan dla odhaczonych zakupów
  const [checkedItems, setCheckedItems] = useState({});

  const [activeModal, setActiveModal] = useState(null); 
  const [selectedCell, setSelectedCell] = useState(null);
  const [viewingRecipe, setViewingRecipe] = useState(null);
  const [viewMode, setViewMode] = useState('desc');
  const [filterCategory, setFilterCategory] = useState(''); 
  const [recipeListCategory, setRecipeListCategory] = useState('Obiad');

  const [newProd, setNewProd] = useState({ id: null, name: '', price: '', amount: '', unit: 'kg' });
  const [newRecipe, setNewRecipe] = useState({ id: null, name: '', category: 'Obiad', instructions: '', steps: [], ingredients: [], is_favorite: false });
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

  const stats = useMemo(() => {
    const shopping = {};
    const daily = {};
    let totalWeekly = 0;
    weekDates.forEach(d => {
      const dayMeals = mealPlan.filter(m => m.date === d.fullDate);
      let dCost = 0;
      dayMeals.forEach(m => {
        const r = recipes.find(rec => rec.id === m.recipe_id);
        if (r) {
          dCost += parseFloat(r.total_cost || 0);
          r.recipe_ingredients?.forEach(ri => {
            const p = ri.products;
            if (p) {
              if (!shopping[p.id]) shopping[p.id] = { id: p.id, name: p.name, amount: 0, unit: p.unit, pricePerUnit: p.price_per_unit };
              shopping[p.id].amount += parseFloat(ri.amount || 0);
            }
          });
        }
      });
      daily[d.fullDate] = dCost.toFixed(2);
      totalWeekly += dCost;
    });
    return { 
      shoppingList: Object.values(shopping).map(it => ({
        ...it, 
        cost: ((it.unit==='kg'||it.unit==='l')?(it.pricePerUnit*(it.amount/1000)):(it.pricePerUnit*it.amount)).toFixed(2)
      })), 
      daily, 
      totalWeekly: totalWeekly.toFixed(2) 
    };
  }, [weekDates, mealPlan, recipes]);

  const toggleCheck = (id) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveProduct = async () => {
    const pPerU = parseFloat(newProd.price) / parseFloat(newProd.amount);
    const d = { name: newProd.name, price_per_unit: pPerU, unit: newProd.unit, last_input_quantity: parseFloat(newProd.amount) };
    if (newProd.id) await supabase.from('products').update(d).eq('id', newProd.id);
    else await supabase.from('products').insert([d]);
    setNewProd({ id: null, name: '', price: '', amount: '', unit: 'kg' });
    fetchData();
  };

  const handleSaveRecipe = async () => {
    const calc = (ing) => {
      const p = parseFloat(ing.price_per_unit || ing.products?.price_per_unit || 0);
      const a = parseFloat(ing.amount || 0);
      const u = ing.unit || ing.products?.unit;
      return (u === 'kg' || u === 'l') ? (p * (a / 1000)) : (p * a);
    };
    const tCost = newRecipe.ingredients.reduce((s, i) => s + calc(i), 0).toFixed(2);
    const rData = { name: newRecipe.name, category: newRecipe.category, total_cost: tCost, instructions: newRecipe.instructions, steps: newRecipe.steps, is_favorite: newRecipe.is_favorite };
    
    let rId = newRecipe.id;
    if (newRecipe.id) {
      await supabase.from('recipes').update(rData).eq('id', newRecipe.id);
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', newRecipe.id);
    } else {
      const { data } = await supabase.from('recipes').insert([rData]).select().single();
      rId = data.id;
    }
    const ings = newRecipe.ingredients.map(ing => ({ recipe_id: rId, product_id: ing.id || ing.product_id, amount: ing.amount }));
    await supabase.from('recipe_ingredients').insert(ings);
    setNewRecipe({ id: null, name: '', category: 'Obiad', instructions: '', steps: [], ingredients: [], is_favorite: false });
    setActiveModal(null);
    fetchData();
  };

  if (loading) return <div style={loadingStyle}>Ładowanie...</div>;
  if (!session) return <LoginView />;

  return (
    <div style={appContainer}>
      <header style={isMobile ? headerMobile : headerStyle}>
        <div><h1 style={{margin:0, color:'#059669'}}>🥗 Jedzonko P</h1><small style={{color:'#64748b'}}>{weekDates[0].displayDate} - {weekDates[6].displayDate}</small></div>
        <div style={navButtons}>
          <button onClick={() => setWeekOffset(prev => prev - 1)} style={btnSec}>⬅</button>
          <button onClick={() => setWeekOffset(0)} style={weekOffset === 0 ? btnTodayActive : btnSec}>Dziś</button>
          <button onClick={() => setWeekOffset(prev => prev + 1)} style={btnSec}>➡</button>
          <button onClick={() => setActiveModal('product')} style={btnSec}>📦 Produkty</button>
          <button onClick={() => setActiveModal('recipe')} style={btnPrim}>👨‍🍳 Przepisy</button>
          <button onClick={handleLogout} style={btnDanger}>Wyloguj</button>
        </div>
      </header>

      {/* KALENDARZ I KOSZTY (Bez zmian dla oszczędności miejsca) */}
      <div style={layoutGrid}>
        <div style={isMobile ? mobileStack : gridStyle}>
           {!isMobile && <div />}
           {!isMobile && MEAL_TYPES.map(m => <div key={m} style={mealHeader}>{m}</div>)}
           {weekDates.map(day => (
             <React.Fragment key={day.fullDate}>
               <div style={isMobile ? mobileDayLabel : dayCell}>
                 <b>{day.name}</b><br/><small>{day.displayDate}</small>
                 {isMobile && <div style={{color:'#059669'}}>{stats.daily[day.fullDate]} zł</div>}
               </div>
               {MEAL_TYPES.map(type => {
                 const m = mealPlan.find(p => p.date === day.fullDate && p.meal_type === type);
                 return (
                   <div key={`${day.fullDate}-${type}`} style={m ? cellStyleActive : cellStyle} onClick={() => { if(!m){setSelectedCell({date:day.fullDate, type}); setFilterCategory(type); setActiveModal('cell');} }}>
                     {isMobile && <span style={mobileMealTag}>{type}</span>}
                     {m ? (
                       <div style={mealContent}>
                         <div style={mealNameS}>{m.recipes.is_favorite && '❤️ '}{m.recipes.name}</div>
                         <div style={mealPriceS}>{m.recipes.total_cost} zł</div>
                         <button style={btnViewS} onClick={(e)=>{e.stopPropagation(); setViewingRecipe(m.recipes); setViewMode('desc'); setActiveModal('view-recipe');}}>Pokaż</button>
                       </div>
                     ) : <span style={{opacity:0.2, fontSize:'24px'}}>+</span>}
                   </div>
                 );
               })}
             </React.Fragment>
           ))}
        </div>
        {!isMobile && (
          <div style={sidePanel}>
            <h3 style={{marginTop:0, color:'#059669'}}>💰 Koszty</h3>
            {weekDates.map(d => <div key={d.fullDate} style={sideRow}><span>{d.name}</span><b>{stats.daily[d.fullDate]} zł</b></div>)}
            <div style={{...sideRow, border:'none', marginTop:'15px', fontSize:'18px'}}><span>Suma tyg.:</span><b style={{color:'#059669'}}>{stats.totalWeekly} zł</b></div>
          </div>
        )}
      </div>

      {/* ZAKTUALIZOWANA LISTA ZAKUPÓW Z CHECKBOXAMI */}
      <div style={shoppingPanel}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '15px'}}>
          <h3 style={{color:'#059669', margin:0}}>🛒 Lista zakupów</h3>
          <button style={{...btnSec, padding:'5px 15px', fontSize:'12px'}} onClick={() => setCheckedItems({})}>Wyczyść zaznaczenia</button>
        </div>
        <div style={shoppingGrid}>
          {stats.shoppingList.map(i => {
            const isChecked = checkedItems[i.id];
            return (
              <div 
                key={i.id} 
                style={{...shoppingItem, opacity: isChecked ? 0.5 : 1, transition: '0.2s', cursor: 'pointer', borderColor: isChecked ? '#059669' : '#f3f4f6'}}
                onClick={() => toggleCheck(i.id)}
              >
                <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                  <div style={{
                    width: '20px', 
                    height: '20px', 
                    borderRadius: '6px', 
                    border: '2px solid #059669', 
                    background: isChecked ? '#059669' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px'
                  }}>
                    {isChecked && '✓'}
                  </div>
                  <div style={{textDecoration: isChecked ? 'line-through' : 'none'}}>
                    <b style={{fontSize:'14px'}}>{i.name}</b><br/>
                    <small>{i.unit === 'szt' ? `${i.amount} szt` : i.amount >= 1000 ? `${(i.amount/1000).toFixed(2)} ${i.unit}` : `${i.amount} ${i.unit === 'kg' ? 'g' : 'ml'}`}</small>
                  </div>
                </div>
                <div style={{textAlign: 'right', fontWeight:'bold', color: isChecked ? '#94a3b8' : '#059669', fontSize:'13px'}}>{i.cost} zł</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODALE (Zachowane z poprzedniej wersji) */}
      {activeModal === 'recipe' && (
        <Modal title="👨‍🍳 Zarządzanie Przepisami" onClose={() => setActiveModal(null)} isMobile={isMobile}>
          {/* ... (kod modala przepisu jak wcześniej) */}
        </Modal>
      )}
      {/* ... pozostałe modale ... */}
    </div>
  );
}

// --- STYLE ---
const appContainer = { padding:'20px', backgroundColor:'#f3f4f6', minHeight:'100vh', fontFamily:'sans-serif' };
const headerStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', background:'white', padding:'20px', borderRadius:'15px', boxShadow:'0 2px 4px rgba(0,0,0,0.05)' };
const headerMobile = { display:'flex', flexDirection:'column', gap:'15px', marginBottom:'20px', background:'white', padding:'20px', borderRadius:'15px', textAlign:'center' };
const navButtons = { display:'flex', gap:'8px', flexWrap:'wrap', justifyContent:'center' };
const layoutGrid = { display: 'grid', gridTemplateColumns: window.innerWidth < 900 ? '1fr' : '1fr 280px', gap: '20px' };
const sidePanel = { background:'white', padding:'20px', borderRadius:'15px', height:'fit-content', boxShadow:'0 2px 4px rgba(0,0,0,0.05)' };
const sideRow = { display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f3f4f6' };
const gridStyle = { display:'grid', gridTemplateColumns:'110px repeat(5, 1fr)', gap:'10px' };
const mobileStack = { display:'flex', flexDirection:'column', gap:'12px' };
const dayCell = { background:'white', padding:'12px', borderRadius:'12px', textAlign:'center', borderLeft:'5px solid #059669' };
const mobileDayLabel = { background:'#059669', color:'white', padding:'12px', borderRadius:'12px', textAlign:'center', fontWeight:'bold', display:'flex', justifyContent:'space-between' };
const mealHeader = { textAlign:'center', fontWeight:'bold', color:'#64748b' };
const cellStyle = { minHeight:'100px', background:'white', borderRadius:'12px', border:'1px solid #e5e7eb', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative' };
const cellStyleActive = { ...cellStyle, border:'2px solid #059669' };
const mealContent = { width:'100%', textAlign:'center', padding:'10px' };
const mealNameS = { fontWeight:'bold', fontSize:'13px' };
const mealPriceS = { fontSize:'12px', color:'#059669', fontWeight:'bold' };
const btnViewS = { background:'#f3f4f6', border:'none', padding:'5px 12px', borderRadius:'6px', fontSize:'10px', cursor:'pointer', marginTop:'8px' };
const shoppingPanel = { marginTop:'30px', background:'white', padding:'25px', borderRadius:'15px', boxShadow:'0 2px 4px rgba(0,0,0,0.05)' };
const shoppingGrid = { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:'15px' };
const shoppingItem = { background:'#f9fafb', padding:'15px', borderRadius:'12px', border:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' };
const btnPrim = { background:'#059669', color:'white', border:'none', padding:'10px 20px', borderRadius:'10px', fontWeight:'bold' };
const btnSec = { background:'#f3f4f6', color:'#374151', border:'none', padding:'10px 20px', borderRadius:'10px' };
const btnTodayActive = { ...btnSec, background:'#059669', color:'white', boxShadow:'0 0 10px rgba(5, 150, 105, 0.4)' };
const btnDanger = { background:'#ef4444', color:'white', border:'none', padding:'10px 20px', borderRadius:'10px' };
const loadingStyle = { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#059669', fontSize:'20px' };
const mobileMealTag = { position:'absolute', top:'5px', left:'8px', fontSize:'9px', color:'#94a3b8', fontWeight:'bold' };