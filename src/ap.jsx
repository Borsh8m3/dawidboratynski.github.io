

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
);

// const SUPABASE_URL = 'TWÓJ_URL';
// const SUPABASE_ANON_KEY = 'TWÓJ_KLUCZ';
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MEAL_TYPES = ['Śniadanie', 'Lunch', 'Obiad', 'Podwieczorek', 'Kolacja'];
const DAYS = [
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
  'Niedziela',
];

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [mealPlan, setMealPlan] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  // Stan dla ręcznie dodanych rzeczy do koszyka (poza tymi z kalendarza)
  const [manualCart, setManualCart] = useState([]);
  const [checkedItems, setCheckedItems] = useState({});

  const [activeModal, setActiveModal] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [viewingRecipe, setViewingRecipe] = useState(null);
  const [viewMode, setViewMode] = useState('desc');
  const [filterCategory, setFilterCategory] = useState('');
  const [recipeListCategory, setRecipeListCategory] = useState('Obiad');

  const [newProd, setNewProd] = useState({
    id: null,
    name: '',
    price: '',
    amount: '',
    unit: 'g',
  });
  const [newRecipe, setNewRecipe] = useState({
    id: null,
    name: '',
    category: 'Obiad',
    instructions: '',
    image_url: '',
    steps: [],
    ingredients: [],
    is_favorite: false,
  });
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = useCallback(() => supabase.auth.signOut(), []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handleResize);
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setSession(session)
    );
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session, weekOffset]);

  async function fetchData() {
    const { data: prods } = await supabase
      .from('products')
      .select('*')
      .order('name');
    const { data: recs } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, products(*))')
      .order('name');
    const { data: plan } = await supabase
      .from('meal_plan')
      .select('*, recipes(*)');
    setProducts(prods || []);
    setRecipes(recs || []);
    setMealPlan(plan || []);
  }

  const weekDates = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) + weekOffset * 7;
    return DAYS.map((name, i) => {
      const d = new Date(new Date().setDate(diff + i));
      return {
        name,
        fullDate: d.toISOString().split('T')[0],
        displayDate: d.toLocaleDateString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
        }),
      };
    });
  }, [weekOffset]);

  // --- LOGIKA KOSZYKA (DYNAMICZNA + RĘCZNA) ---
  const finalShoppingList = useMemo(() => {
    const combined = {};

    // 1. Dodaj składniki z planu posiłków na dany tydzień
    weekDates.forEach((d) => {
      const dayMeals = mealPlan.filter((m) => m.date === d.fullDate);
      dayMeals.forEach((m) => {
        const r = recipes.find((rec) => rec.id === m.recipe_id);
        r?.recipe_ingredients?.forEach((ri) => {
          const p = ri.products;
          if (!p) return;
          const key = `${p.name}-${p.unit}`;
          if (!combined[key])
            combined[key] = {
              id: p.id,
              name: p.name,
              amount: 0,
              unit: p.unit,
              cost: 0,
              pricePU: p.price_per_unit,
            };
          combined[key].amount += parseFloat(ri.amount || 0);
        });
      });
    });

    // 2. Dodaj rzeczy dorzucone ręcznie
    manualCart.forEach((item) => {
      const key = `${item.name}-${item.unit}`;
      if (!combined[key])
        combined[key] = {
          id: item.id,
          name: item.name,
          amount: 0,
          unit: item.unit,
          cost: 0,
          pricePU: item.pricePU,
        };
      combined[key].amount += parseFloat(item.amount);
    });

    return Object.values(combined).map((it) => ({
      ...it,
      cost: (it.pricePU * it.amount).toFixed(2),
    }));
  }, [weekDates, mealPlan, recipes, manualCart]);

  const dailyStats = useMemo(() => {
    const daily = {};
    let weekly = 0;
    weekDates.forEach((d) => {
      const dayMeals = mealPlan.filter((m) => m.date === d.fullDate);
      let cost = 0;
      dayMeals.forEach((m) => {
        const r = recipes.find((rec) => rec.id === m.recipe_id);
        if (r?.total_cost) cost += parseFloat(r.total_cost);
      });
      daily[d.fullDate] = cost.toFixed(2);
      weekly += cost;
    });
    return { daily, weekly: weekly.toFixed(2) };
  }, [weekDates, mealPlan, recipes]);

  // --- HANDLERS ---
  const handleAddManualProduct = (p) => {
    setManualCart((prev) => [
      ...prev,
      {
        id: p.id,
        name: p.name,
        amount: p.last_input_quantity || 100,
        unit: p.unit,
        pricePU: p.price_per_unit,
      },
    ]);
  };

  const handleAddManualRecipe = (r) => {
    const ings = r.recipe_ingredients.map((ri) => ({
      id: ri.products.id,
      name: ri.products.name,
      amount: ri.amount,
      unit: ri.products.unit,
      pricePU: ri.products.price_per_unit,
    }));
    setManualCart((prev) => [...prev, ...ings]);
  };

  const handleSaveProduct = async () => {
    const pPerU = parseFloat(newProd.price) / parseFloat(newProd.amount);
    const d = {
      name: newProd.name,
      price_per_unit: pPerU,
      unit: newProd.unit,
      last_input_quantity: parseFloat(newProd.amount),
    };
    if (newProd.id)
      await supabase.from('products').update(d).eq('id', newProd.id);
    else await supabase.from('products').insert([d]);
    setNewProd({ id: null, name: '', price: '', amount: '', unit: 'g' });
    fetchData();
  };

  const handleSaveRecipe = async () => {
    const calc = (ing) =>
      parseFloat(ing.price_per_unit || ing.products?.price_per_unit || 0) *
      parseFloat(ing.amount || 0);
    const tCost = newRecipe.ingredients
      .reduce((s, i) => s + calc(i), 0)
      .toFixed(2);
    const rData = {
      name: newRecipe.name,
      category: newRecipe.category,
      total_cost: tCost,
      instructions: newRecipe.instructions,
      steps: newRecipe.steps,
      image_url: newRecipe.image_url,
      is_favorite: newRecipe.is_favorite,
    };
    let rId = newRecipe.id;
    if (newRecipe.id) {
      await supabase.from('recipes').update(rData).eq('id', newRecipe.id);
      await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('recipe_id', newRecipe.id);
    } else {
      const { data } = await supabase
        .from('recipes')
        .insert([rData])
        .select()
        .single();
      rId = data.id;
    }
    const ings = newRecipe.ingredients.map((ing) => ({
      recipe_id: rId,
      product_id: ing.id || ing.product_id,
      amount: ing.amount,
    }));
    await supabase.from('recipe_ingredients').insert(ings);
    setNewRecipe({
      id: null,
      name: '',
      category: 'Obiad',
      instructions: '',
      image_url: '',
      steps: [],
      ingredients: [],
      is_favorite: false,
    });
    setActiveModal(null);
    fetchData();
  };

  if (loading) return <div style={loadingStyle}>🍳 Rozgrzewanie kuchni...</div>;
  if (!session) return <LoginView />;

  return (
    <div style={appContainer}>
      <header style={isMobile ? headerMobile : headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={logoCircleS}>🍳</div>
          <div>
            <h1
              style={{
                margin: 0,
                color: '#059669',
                fontSize: isMobile ? '20px' : '26px',
              }}
            >
              Jedzonko P
            </h1>
            <small style={{ color: '#64748b' }}>
              {weekDates[0].displayDate} - {weekDates[6].displayDate}
            </small>
          </div>
        </div>
        <div style={navButtons}>
          <button onClick={() => setWeekOffset((p) => p - 1)} style={btnSec}>
            ⬅
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            style={weekOffset === 0 ? btnTodayActive : btnSec}
          >
            Dziś
          </button>
          <button onClick={() => setWeekOffset((p) => p + 1)} style={btnSec}>
            ➡
          </button>
          <button onClick={() => setActiveModal('product')} style={btnSec}>
            📦 Produkty
          </button>
          <button onClick={() => setActiveModal('recipe')} style={btnPrim}>
            👨‍🍳 Przepisy
          </button>
          <button onClick={handleLogout} style={btnDanger}>
            Wyloguj
          </button>
        </div>
      </header>

      <div style={layoutGrid}>
        <div style={isMobile ? mobileStack : gridStyle}>
          {!isMobile && <div />}
          {!isMobile &&
            MEAL_TYPES.map((m) => (
              <div key={m} style={mealHeader}>
                {m}
              </div>
            ))}
          {weekDates.map((day) => (
            <React.Fragment key={day.fullDate}>
              <div style={isMobile ? mobileDayLabel : dayCell}>
                <b>{day.name}</b>
                <br />
                <small>{day.displayDate}</small>
                {isMobile && (
                  <div style={{ color: '#059669' }}>
                    {dailyStats.daily[day.fullDate]} zł
                  </div>
                )}
              </div>
              {MEAL_TYPES.map((type) => {
                const m = mealPlan.find(
                  (p) => p.date === day.fullDate && p.meal_type === type
                );
                // DYNAMICZNE TŁO ZDJĘCIA
                const bgImage = m?.recipes?.image_url
                  ? `linear-gradient(rgba(255,255,255,0.7), rgba(255,255,255,0.7)), url(${m.recipes.image_url})`
                  : 'white';
                return (
                  <div
                    key={`${day.fullDate}-${type}`}
                    style={{
                      ...(m ? cellStyleActive : cellStyle),
                      backgroundImage: bgImage,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    onClick={() => {
                      if (!m) {
                        setSelectedCell({ date: day.fullDate, type });
                        setFilterCategory(type);
                        setActiveModal('cell');
                      }
                    }}
                  >
                    {isMobile && <span style={mobileMealTag}>{type}</span>}
                    {m ? (
                      <div style={mealContent}>
                        <div style={mealNameS}>
                          {m.recipes.is_favorite && '❤️ '}
                          {m.recipes.name}
                        </div>
                        <div style={mealPriceS}>
                          {parseFloat(m.recipes.total_cost || 0).toFixed(2)} zł
                        </div>
                        <button
                          style={btnViewSmall}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingRecipe(m.recipes);
                            setViewMode('desc');
                            setActiveModal('view-recipe');
                          }}
                        >
                          Pokaż
                        </button>
                        <button
                          style={btnDelSmall}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm('Usunąć?')) {
                              await supabase
                                .from('meal_plan')
                                .delete()
                                .eq('id', m.id);
                              fetchData();
                            }
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span style={{ opacity: 0.2, fontSize: '24px' }}>+</span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        {!isMobile && (
          <div style={sidePanel}>
            <h3 style={{ marginTop: 0 }}>💰 Koszty</h3>
            {weekDates.map((d) => (
              <div key={d.fullDate} style={sideRow}>
                <span>{d.name}</span>
                <b>{dailyStats.daily[d.fullDate]} zł</b>
              </div>
            ))}
            <div style={grandTotalS}>
              <span>Suma:</span>
              <b>{dailyStats.weekly} zł</b>
            </div>
          </div>
        )}
      </div>

      <div style={shoppingPanel}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '15px',
          }}
        >
          <h3 style={{ color: '#059669', margin: 0 }}>🛒 Koszyk zakupowy</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              style={btnPrim}
              onClick={() => setActiveModal('add-to-cart')}
            >
              Dodaj +
            </button>
            <button
              style={{ ...btnSec, padding: '5px 15px' }}
              onClick={() => {
                setManualCart([]);
                setCheckedItems({});
              }}
            >
              Reset
            </button>
          </div>
        </div>
        <div style={shoppingGrid}>
          {finalShoppingList.map((i) => (
            <div
              key={i.name}
              onClick={() =>
                setCheckedItems((p) => ({ ...p, [i.name]: !p[i.name] }))
              }
              style={{
                ...shoppingItem,
                opacity: checkedItems[i.name] ? 0.5 : 1,
                border: checkedItems[i.name]
                  ? '1px solid #059669'
                  : '1px solid #f3f4f6',
                cursor: 'pointer',
              }}
            >
              <div
                style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid #059669',
                    borderRadius: '4px',
                    background: checkedItems[i.name]
                      ? '#059669'
                      : 'transparent',
                    color: 'white',
                    textAlign: 'center',
                    lineHeight: '16px',
                  }}
                >
                  {checkedItems[i.name] && '✓'}
                </div>
                <div
                  style={{
                    textDecoration: checkedItems[i.name]
                      ? 'line-through'
                      : 'none',
                  }}
                >
                  <b>{i.name}</b>
                  <br />
                  <small>
                    {i.amount} {i.unit}
                  </small>
                </div>
              </div>
              <b style={{ color: '#059669' }}>{i.cost} zł</b>
            </div>
          ))}
        </div>
      </div>

            {/* MODAL: STATYSTYKI (ŚLEDŹ ZAKUPY) */}
      {activeModal === 'stats' && (
        <Modal title="📈 Summary" onClose={() => setActiveModal(null)} isMobile={isMobile}>
          <div style={{maxHeight:'70vh', overflowY:'auto'}}>
            <div style={statSection}>
              <h4>💳 Wydatki miesięczne</h4>
              {advancedStats.monthly.map(([month, val]) => (
                <div key={month} style={sideRow}><span>{month}</span><b style={{color:'#059669'}}>{val.toFixed(2)} zł</b></div>
              ))}
            </div>
            
            <div style={statSection}>
              <h4>⭐ Najczęstsze dania</h4>
              {advancedStats.topRecipes.map(([name, count]) => (
                <div key={name} style={sideRow}><span>{name}</span><b>{count}x</b></div>
              ))}
            </div>

            <div style={statSection}>
              <h4>💸 Najkosztowniejsze składniki</h4>
              {advancedStats.topIngredients.map(([name, data]) => (
                <div key={name} style={sideRow}><span>{name}</span><b style={{color:'#ef4444'}}>{data.cost.toFixed(2)} zł</b></div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: DODAJ DO KOSZYKA (RĘCZNIE) */}
      {activeModal === 'add-to-cart' && (
        <Modal
          title="🛒 Dodaj do koszyka"
          onClose={() => setActiveModal(null)}
          isMobile={isMobile}
        >
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <h4>Wybierz przepis:</h4>
            {recipes.map((r) => (
              <div
                key={r.id}
                style={recipeListItem}
                onClick={() => {
                  handleAddManualRecipe(r);
                  setActiveModal(null);
                }}
              >
                <span>{r.name}</span>{' '}
                <button style={btnCartAddSmall}>+ Wszystkie składniki</button>
              </div>
            ))}
            <hr />
            <h4>Lub pojedynczy produkt:</h4>
            {products.map((p) => (
              <div
                key={p.id}
                style={productRowS}
                onClick={() => {
                  handleAddManualProduct(p);
                  setActiveModal(null);
                }}
              >
                <span>{p.name}</span>{' '}
                <button style={btnCartAddSmall}>Dodaj</button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* MODAL: PRZEPISY (Z LINKIEM DO ZDJĘCIA) */}
      {activeModal === 'recipe' && (
        <Modal
          title="👨‍🍳 Zarządzanie"
          onClose={() => setActiveModal(null)}
          isMobile={isMobile}
        >
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={formBoxS}>
              <input
                style={inputS}
                placeholder="Nazwa dania"
                value={newRecipe.name}
                onChange={(e) =>
                  setNewRecipe({ ...newRecipe, name: e.target.value })
                }
              />
              <input
                style={inputS}
                placeholder="Link do zdjęcia URL"
                value={newRecipe.image_url}
                onChange={(e) =>
                  setNewRecipe({ ...newRecipe, image_url: e.target.value })
                }
              />
              <textarea
                style={inputS}
                placeholder="Opis przygotowania..."
                value={newRecipe.instructions}
                onChange={(e) =>
                  setNewRecipe({ ...newRecipe, instructions: e.target.value })
                }
              />
              <button style={btnSuccessFull} onClick={handleSaveRecipe}>
                Zapisz
              </button>
            </div>
            {recipes.map((r) => (
              <div key={r.id} style={productRowS}>
                <span>{r.name}</span>
                <button
                  onClick={() =>
                    setNewRecipe({
                      ...r,
                      steps: r.steps || [],
                      ingredients: r.recipe_ingredients.map((ri) => ({
                        ...ri.products,
                        amount: ri.amount,
                        product_id: ri.product_id,
                      })),
                    })
                  }
                  style={iconBtn}
                >
                  ✏️
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* MODAL: PODGLĄD (TRYB KROKÓW) */}
      {activeModal === 'view-recipe' && viewingRecipe && (
        <Modal
          title={viewingRecipe.name}
          onClose={() => setActiveModal(null)}
          isMobile={isMobile}
        >
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button
              style={viewMode === 'desc' ? btnFilterActive : btnFilter}
              onClick={() => setViewMode('desc')}
            >
              Opis
            </button>
            <button
              style={viewMode === 'steps' ? btnFilterActive : btnFilter}
              onClick={() => setViewMode('steps')}
            >
              Kroki
            </button>
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {viewMode === 'desc' ? (
              <p
                style={{
                  whiteSpace: 'pre-wrap',
                  background: '#f8fafc',
                  padding: '15px',
                  borderRadius: '10px',
                }}
              >
                {viewingRecipe.instructions}
              </p>
            ) : (
              viewingRecipe.steps?.map((s, i) => (
                <div key={i} style={stepItemS}>
                  <b>Krok {i + 1}</b>
                  <br />
                  {s}
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* INNE MODALE (PRODUKTY, CELL) - Jak wcześniej */}
      {activeModal === 'product' && (
        <Modal
          title="📦 Produkty"
          onClose={() => setActiveModal(null)}
          isMobile={isMobile}
        >
          <div style={formBoxS}>
            <input
              style={inputS}
              placeholder="Nazwa"
              value={newProd.name}
              onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
            />
            <div style={{ display: 'flex', gap: '5px' }}>
              <input
                style={inputS}
                type="number"
                placeholder="Cena"
                value={newProd.price}
                onChange={(e) =>
                  setNewProd({ ...newProd, price: e.target.value })
                }
              />
              <input
                style={inputS}
                type="number"
                placeholder="Ilość"
                value={newProd.amount}
                onChange={(e) =>
                  setNewProd({ ...newProd, amount: e.target.value })
                }
              />
              <select
                style={inputS}
                value={newProd.unit}
                onChange={(e) =>
                  setNewProd({ ...newProd, unit: e.target.value })
                }
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="szt">szt</option>
              </select>
            </div>
            <button style={btnSuccessFull} onClick={handleSaveProduct}>
              Zapisz
            </button>
          </div>
          <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
            {products.map((p) => (
              <div key={p.id} style={productRowS}>
                <span>{p.name}</span>
                <button
                  onClick={() =>
                    setNewProd({
                      id: p.id,
                      name: p.name,
                      price: (p.price_per_unit * p.last_input_quantity).toFixed(
                        2
                      ),
                      amount: p.last_input_quantity,
                      unit: p.unit,
                    })
                  }
                  style={iconBtn}
                >
                  ✏️
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {activeModal === 'cell' && (
        <Modal
          title="Wybierz posiłek"
          onClose={() => setActiveModal(null)}
          isMobile={isMobile}
        >
          <div style={filterBar}>
            {['Wszystkie', ...MEAL_TYPES].map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setFilterCategory(cat === 'Wszystkie' ? '' : cat)
                }
                style={
                  filterCategory === (cat === 'Wszystkie' ? '' : cat)
                    ? btnFilterActive
                    : btnFilter
                }
              >
                {cat}
              </button>
            ))}
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {recipes
              .filter((r) => !filterCategory || r.category === filterCategory)
              .sort((a, b) => b.is_favorite - a.is_favorite)
              .map((r) => (
                <div
                  key={r.id}
                  style={recipeListItem}
                  onClick={async () => {
                    await supabase
                      .from('meal_plan')
                      .insert([
                        {
                          date: selectedCell.date,
                          meal_type: selectedCell.type,
                          recipe_id: r.id,
                        },
                      ]);
                    setActiveModal(null);
                    fetchData();
                  }}
                >
                  <span>{r.name}</span>{' '}
                  <b>{parseFloat(r.total_cost || 0).toFixed(2)} zł</b>
                </div>
              ))}
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) alert(error.message);
  };
  return (
    <div style={loginOverlay}>
      <form onSubmit={handleLogin} style={loginForm}>
        <h2>Jedzonko P</h2>
        <input
          style={inputS}
          type="email"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={inputS}
          type="password"
          placeholder="Hasło"
          onChange={(e) => setPassword(e.target.value)}
        />
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '15px',
            alignItems: 'center',
          }}
        >
          <h3>{title}</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '28px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --- STYLES ---
const appContainer = {
  padding: '20px',
  backgroundColor: '#f3f4f6',
  minHeight: '100vh',
  fontFamily: 'sans-serif',
};
const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
  background: 'white',
  padding: '20px',
  borderRadius: '15px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
};
const headerMobile = {
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
  marginBottom: '20px',
  background: 'white',
  padding: '20px',
  borderRadius: '15px',
  textAlign: 'center',
};
const navButtons = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  justifyContent: 'center',
};
const layoutGrid = {
  display: 'grid',
  gridTemplateColumns: window.innerWidth < 900 ? '1fr' : '1fr 280px',
  gap: '20px',
};
const sidePanel = {
  background: 'white',
  padding: '20px',
  borderRadius: '15px',
  height: 'fit-content',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
};
const sideRow = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid #f3f4f6',
};
const grandTotalS = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '15px',
  padding: '10px',
  background: '#f0fdf4',
  borderRadius: '10px',
  color: '#059669',
  fontWeight: 'bold',
};
const gridStyle = {
  display: 'grid',
  gridTemplateColumns: '110px repeat(5, 1fr)',
  gap: '10px',
};
const mobileStack = { display: 'flex', flexDirection: 'column', gap: '12px' };
const dayCell = {
  background: 'white',
  padding: '12px',
  borderRadius: '12px',
  textAlign: 'center',
  borderLeft: '5px solid #059669',
  fontWeight: 'bold',
};
const mobileDayLabel = {
  background: '#059669',
  color: 'white',
  padding: '12px',
  borderRadius: '12px',
  textAlign: 'center',
  fontWeight: 'bold',
  display: 'flex',
  justifyContent: 'space-between',
};
const mealHeader = {
  textAlign: 'center',
  fontWeight: 'bold',
  color: '#64748b',
};
const cellStyle = {
  minHeight: '110px',
  background: 'white',
  borderRadius: '12px',
  border: '1px solid #e5e7eb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  position: 'relative',
  overflow: 'hidden',
};
const cellStyleActive = { ...cellStyle, border: '2px solid #059669' };
const mealContent = {
  width: '100%',
  textAlign: 'center',
  padding: '10px',
  background: 'rgba(255,255,255,0.75)',
  borderRadius: '8px',
};
const mealNameS = { fontWeight: 'bold', fontSize: '13px' };
const mealPriceS = { fontSize: '12px', color: '#059669', fontWeight: 'bold' };
const btnViewSmall = {
  background: '#059669',
  color: 'white',
  border: 'none',
  padding: '4px 8px',
  borderRadius: '6px',
  fontSize: '10px',
  cursor: 'pointer',
  marginTop: '5px',
};
const btnDelSmall = {
  position: 'absolute',
  top: '5px',
  right: '5px',
  background: '#fee2e2',
  color: '#ef4444',
  border: 'none',
  borderRadius: '50%',
  width: '22px',
  height: '22px',
  fontSize: '10px',
  cursor: 'pointer',
};
const shoppingPanel = {
  marginTop: '30px',
  background: 'white',
  padding: '25px',
  borderRadius: '15px',
};
const shoppingGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: '15px',
};
const shoppingItem = {
  background: '#f9fafb',
  padding: '12px',
  borderRadius: '12px',
  border: '1px solid #f3f4f6',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};
const inputS = {
  width: '100%',
  padding: '10px',
  marginBottom: '5px',
  borderRadius: '10px',
  border: '1px solid #d1d5db',
  boxSizing: 'border-box',
};
const btnPrim = {
  background: '#059669',
  color: 'white',
  border: 'none',
  padding: '10px 20px',
  borderRadius: '10px',
  fontWeight: 'bold',
};
const btnSec = {
  background: '#f3f4f6',
  color: '#374151',
  border: 'none',
  padding: '10px 20px',
  borderRadius: '10px',
};
const btnTodayActive = {
  ...btnSec,
  background: '#059669',
  color: 'white',
  boxShadow: '0 0 10px rgba(5, 150, 105, 0.4)',
};
const btnSuccessFull = {
  background: '#059669',
  color: 'white',
  border: 'none',
  padding: '14px',
  borderRadius: '12px',
  width: '100%',
  cursor: 'pointer',
  fontWeight: 'bold',
  marginTop: '10px',
};
const btnFilter = {
  background: '#f3f4f6',
  color: '#6b7280',
  border: 'none',
  padding: '8px 16px',
  borderRadius: '20px',
  cursor: 'pointer',
};
const btnFilterActive = { ...btnFilter, background: '#059669', color: 'white' };
const filterBar = {
  display: 'flex',
  gap: '5px',
  marginBottom: '15px',
  overflowX: 'auto',
};
const productRowS = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px',
  borderBottom: '1px solid #f3f4f6',
  alignItems: 'center',
  cursor: 'pointer',
};
const recipeListItem = {
  padding: '15px',
  borderBottom: '1px solid #f3f4f6',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
};
const searchResultsS = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  marginBottom: '15px',
};
const iconBtn = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: '18px',
};
const overlayS = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
};
const modalS = {
  background: 'white',
  borderRadius: '20px',
  boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
  position: 'relative',
};
const loginOverlay = {
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  background: '#f3f4f6',
};
const loginForm = {
  background: 'white',
  padding: '40px',
  borderRadius: '25px',
  width: '320px',
};
const loadingStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  color: '#059669',
  fontSize: '20px',
  fontWeight: 'bold',
};
const logoCircleS = {
  width: '40px',
  height: '40px',
  backgroundColor: '#ecfdf5',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
  border: '2px solid #059669',
};
const mobileMealTag = {
  position: 'absolute',
  top: '5px',
  left: '8px',
  fontSize: '9px',
  color: '#94a3b8',
  fontWeight: 'bold',
};
const formBoxS = {
  background: '#f9fafb',
  padding: '15px',
  borderRadius: '15px',
  marginBottom: '20px',
  border: '1px solid #e5e7eb',
};
const stepItemS = {
  padding: '15px',
  background: '#f0fdf4',
  borderRadius: '10px',
  borderLeft: '4px solid #059669',
  marginBottom: '10px',
};
const btnCartAddSmall = {
  background: '#e0f2fe',
  color: '#0369a1',
  border: 'none',
  padding: '4px 8px',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 'bold',
  cursor: 'pointer',
};
const btnDanger = {
  background: '#ef4444',
  color: 'white',
  border: 'none',
  padding: '10px 20px',
  borderRadius: '10px',
};
