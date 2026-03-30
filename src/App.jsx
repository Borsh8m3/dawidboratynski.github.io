import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

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

const MEAL_COLORS = {
  Śniadanie: 'linear-gradient(135deg, #fef9c3 0%, #fef08a 100%)',
  Lunch: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
  Obiad: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
  Podwieczorek: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
  Kolacja: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
};

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [mealPlan, setMealPlan] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
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

  const advancedStats = useMemo(() => {
    const monthlySpending = {};
    const ingredientStats = {};
    mealPlan.forEach((meal) => {
      const recipe = recipes.find((r) => r.id === meal.recipe_id);
      if (!recipe) return;
      const dateObj = new Date(meal.date);
      const monthLabel = dateObj.toLocaleDateString('pl-PL', {
        month: 'long',
        year: 'numeric',
      });
      monthlySpending[monthLabel] =
        (monthlySpending[monthLabel] || 0) + parseFloat(recipe.total_cost);
      recipe.recipe_ingredients?.forEach((ri) => {
        const p = ri.products;
        if (!p) return;
        if (!ingredientStats[p.name])
          ingredientStats[p.name] = { count: 0, totalCost: 0 };
        ingredientStats[p.name].count += 1;
        ingredientStats[p.name].totalCost += p.price_per_unit * ri.amount;
      });
    });
    return {
      monthly: Object.entries(monthlySpending).reverse(),
      topByCount: Object.entries(ingredientStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5),
      topByCost: Object.entries(ingredientStats)
        .sort((a, b) => b[1].totalCost - a[1].totalCost)
        .slice(0, 5),
    };
  }, [mealPlan, recipes]);

  const finalShoppingList = useMemo(() => {
    const combined = {};
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

  const dailyCosts = useMemo(() => {
    const daily = {};
    let weeklyTotal = 0;
    weekDates.forEach((d) => {
      const dayMeals = mealPlan.filter((m) => m.date === d.fullDate);
      let daySum = 0;
      dayMeals.forEach((m) => {
        const r = recipes.find((rec) => rec.id === m.recipe_id);
        if (r?.total_cost) daySum += parseFloat(r.total_cost);
      });
      daily[d.fullDate] = daySum.toFixed(2);
      weeklyTotal += daySum;
    });
    return { daily, weeklyTotal: weeklyTotal.toFixed(2) };
  }, [weekDates, mealPlan, recipes]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () =>
        setNewRecipe((prev) => ({ ...prev, image_url: reader.result }));
      reader.readAsDataURL(file);
    }
  };

  const handleSaveRecipe = async () => {
    if (!newRecipe.name) return;
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

  if (loading) return <div style={loadingStyle}>🍳 Ładowanie...</div>;
  if (!session) return <LoginView />;

  return (
    <div style={appContainer}>
      <header style={isMobile ? headerMobile : headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={logoCircleS}>🥗</div>
          <div>
            <h1 style={logoTitleS}>Jedzonko Planer</h1>
            <small style={{ color: '#64748b', fontWeight: 'bold' }}>
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
          <button onClick={() => setActiveModal('stats')} style={btnStats}>
            📈
          </button>
          <button onClick={() => setActiveModal('product')} style={btnSec}>
            📦
          </button>
          <button onClick={() => setActiveModal('recipe')} style={btnPrim}>
            👨‍🍳
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
            [...MEAL_TYPES, 'Suma'].map((m) => (
              <div key={m} style={mealHeader}>
                {m}
              </div>
            ))}

          {weekDates.map((day) => (
            <React.Fragment key={day.fullDate}>
              <div style={isMobile ? mobileDayLabel : dayCell}>
                <b
                  style={{
                    fontSize: '11px',
                    display: 'block',
                    wordBreak: 'break-word',
                  }}
                >
                  {day.name}
                </b>
                <small style={{ fontSize: '10px', opacity: 0.8 }}>
                  {day.displayDate}
                </small>
              </div>

              {MEAL_TYPES.map((type) => {
                const m = mealPlan.find(
                  (p) => p.date === day.fullDate && p.meal_type === type
                );
                const hasImage = m?.recipes?.image_url;
                const bgStyle = hasImage
                  ? `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.7)), url(${m.recipes.image_url})`
                  : MEAL_COLORS[type];

                return (
                  <div
                    key={`${day.fullDate}-${type}`}
                    style={{
                      ...(m ? cellStyleActive : cellStyle),
                      backgroundImage: m ? bgStyle : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      background: !m ? 'white' : undefined,
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
                        <div
                          style={{
                            ...mealNameS,
                            color: hasImage ? 'white' : '#1e293b',
                            textShadow: hasImage
                              ? '0 2px 4px rgba(0,0,0,0.9)'
                              : 'none',
                          }}
                        >
                          {m.recipes.is_favorite && '❤️ '}
                          {m.recipes.name}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: '5px',
                            justifyContent: 'center',
                            marginTop: 'auto',
                            paddingBottom: '5px',
                          }}
                        >
                          <button
                            style={{
                              ...btnViewSmall,
                              borderColor: hasImage ? 'white' : '#059669',
                              color: hasImage ? 'white' : '#059669',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingRecipe(m.recipes);
                              setViewMode('desc');
                              setActiveModal('view-recipe');
                            }}
                          >
                            👁️
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
                      </div>
                    ) : (
                      <span style={{ opacity: 0.2, fontSize: '20px' }}>+</span>
                    )}
                  </div>
                );
              })}

              <div style={isMobile ? mobileSumLabel : daySumCell}>
                {isMobile && (
                  <span style={{ fontSize: '10px', opacity: 0.8 }}>SUMA:</span>
                )}
                <b
                  style={{
                    fontSize: '12px',
                    color: isMobile ? 'white' : '#059669',
                  }}
                >
                  {dailyCosts.daily[day.fullDate]} zł
                </b>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={weekSummaryPanel}>
        <div style={{ textAlign: 'center' }}>
          <span
            style={{ color: '#64748b', fontSize: '13px', fontWeight: 'bold' }}
          >
            CAŁKOWITY KOSZT TYGODNIA
          </span>
          <div
            style={{ fontSize: '28px', fontWeight: '900', color: '#059669' }}
          >
            {dailyCosts.weeklyTotal} zł
          </div>
        </div>
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
          <h3 style={{ color: '#059669', margin: 0, fontSize: '18px' }}>
            🛒 Lista zakupów
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={btnPrimSmall}
              onClick={() => setActiveModal('add-to-cart')}
            >
              Dodaj +
            </button>
            <button
              style={{ ...btnSec, padding: '5px 10px', fontSize: '11px' }}
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
          {finalShoppingList.map((i) => {
            const isChecked = checkedItems[i.name];
            let dAmount = i.amount;
            let dUnit = i.unit;
            if ((i.unit === 'g' || i.unit === 'ml') && i.amount >= 1000) {
              dAmount = (i.amount / 1000).toFixed(2);
              dUnit = i.unit === 'g' ? 'kg' : 'l';
            }
            return (
              <div
                key={i.name}
                onClick={() =>
                  setCheckedItems((p) => ({ ...p, [i.name]: !p[i.name] }))
                }
                style={{
                  ...shoppingItem,
                  opacity: isChecked ? 0.5 : 1,
                  border: isChecked ? '1px solid #059669' : '1px solid #e2e8f0',
                  background: isChecked ? '#f0fdf4' : '#fff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    flex: 1,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      border: '2px solid #059669',
                      borderRadius: '4px',
                      background: isChecked ? '#059669' : 'transparent',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      flexShrink: 0,
                    }}
                  >
                    {isChecked && '✓'}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div
                      style={{
                        fontWeight: '700',
                        fontSize: '13px',
                        textDecoration: isChecked ? 'line-through' : 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: '#1e293b',
                      }}
                    >
                      {i.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {dAmount} {dUnit}
                    </div>
                  </div>
                </div>
                <b
                  style={{
                    color: isChecked ? '#94a3b8' : '#059669',
                    fontSize: '13px',
                    marginLeft: '8px',
                    flexShrink: 0,
                  }}
                >
                  {i.cost} zł
                </b>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL STATYSTYKI */}
      {activeModal === 'stats' && (
        <Modal
          title="📈 Twoje Statystyki"
          onClose={() => setActiveModal(null)}
          isMobile={isMobile}
        >
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={statBoxS}>
              <h4 style={statLabelS}>💳 Wydatki miesięczne</h4>
              {advancedStats.monthly.map(([label, total]) => (
                <div key={label} style={statRowS}>
                  <span>{label}</span>
                  <b style={{ color: '#059669' }}>{total.toFixed(2)} zł</b>
                </div>
              ))}
            </div>
            <div style={statBoxS}>
              <h4 style={statLabelS}>⭐ Najczęstsze produkty</h4>
              {advancedStats.topByCount.map(([name, data]) => (
                <div key={name} style={statRowS}>
                  <span>{name}</span>
                  <small>{data.count}x</small>
                </div>
              ))}
            </div>
            <div style={statBoxS}>
              <h4 style={statLabelS}>💸 Sumarycznie najdroższe</h4>
              {advancedStats.topByCost.map(([name, data]) => (
                <div key={name} style={statRowS}>
                  <span>{name}</span>
                  <b style={{ color: '#e11d48' }}>
                    {data.totalCost.toFixed(2)} zł
                  </b>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL DODAWANIA DO LISTY */}
      {activeModal === 'add-to-cart' && (
        <Modal
          title="🛒 Dodaj do listy"
          onClose={() => setActiveModal(null)}
          isMobile={isMobile}
        >
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <h4 style={{ fontSize: '14px' }}>Z przepisu:</h4>
            {recipes.map((r) => (
              <div
                key={r.id}
                style={recipeListItem}
                onClick={() => {
                  setManualCart((p) => [
                    ...p,
                    ...r.recipe_ingredients.map((ri) => ({
                      id: ri.products.id,
                      name: ri.products.name,
                      amount: ri.amount,
                      unit: ri.products.unit,
                      pricePU: ri.products.price_per_unit,
                    })),
                  ]);
                  setActiveModal(null);
                }}
              >
                <span>{r.name}</span>{' '}
                <button style={btnCartAddSmall}>+ Składniki</button>
              </div>
            ))}
            <h4 style={{ fontSize: '14px', marginTop: '15px' }}>
              Z bazy produktów:
            </h4>
            {products.map((p) => (
              <div
                key={p.id}
                style={productRowS}
                onClick={() => {
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

      {/* MODAL PRZEPISY */}
      {activeModal === 'recipe' && (
        <Modal
          title="👨‍🍳 Zarządzanie"
          onClose={() => setActiveModal(null)}
          isMobile={isMobile}
        >
          <div style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            <div style={formBoxS}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  style={{ ...inputS, marginBottom: 0 }}
                  placeholder="Nazwa dania"
                  value={newRecipe.name}
                  onChange={(e) =>
                    setNewRecipe({ ...newRecipe, name: e.target.value })
                  }
                />
                <button
                  onClick={() =>
                    setNewRecipe({
                      ...newRecipe,
                      is_favorite: !newRecipe.is_favorite,
                    })
                  }
                  style={{ ...iconBtn, fontSize: '24px' }}
                >
                  {newRecipe.is_favorite ? '❤️' : '🤍'}
                </button>
              </div>
              <label style={fileLabelS}>
                {newRecipe.image_url
                  ? '✅ Zdjęcie wybrane'
                  : '📷 Wybierz zdjęcie'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
              <textarea
                style={inputS}
                placeholder="Opis..."
                value={newRecipe.instructions}
                onChange={(e) =>
                  setNewRecipe({ ...newRecipe, instructions: e.target.value })
                }
              />
              {newRecipe.steps.map((s, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', gap: '5px', marginTop: '5px' }}
                >
                  <div style={stepCircleS}>{i + 1}</div>
                  <input
                    style={{ ...inputS, marginBottom: 0 }}
                    value={s}
                    onChange={(e) => {
                      const c = [...newRecipe.steps];
                      c[i] = e.target.value;
                      setNewRecipe({ ...newRecipe, steps: c });
                    }}
                  />
                  <button
                    onClick={() =>
                      setNewRecipe({
                        ...newRecipe,
                        steps: newRecipe.steps.filter((_, idx) => idx !== i),
                      })
                    }
                    style={btnDelSmall}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                style={{
                  ...btnSec,
                  width: '100%',
                  padding: '8px',
                  marginTop: '5px',
                }}
                onClick={() =>
                  setNewRecipe({
                    ...newRecipe,
                    steps: [...newRecipe.steps, ''],
                  })
                }
              >
                + Dodaj krok
              </button>
              <input
                style={inputS}
                placeholder="🔍 Składnik..."
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <div style={searchResultsS}>
                  {products
                    .filter((p) =>
                      p.name.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((p) => (
                      <div
                        key={p.id}
                        style={searchItemS}
                        onClick={() => {
                          setNewRecipe({
                            ...newRecipe,
                            ingredients: [
                              ...newRecipe.ingredients,
                              { ...p, amount: 100 },
                            ],
                          });
                          setSearchQuery('');
                        }}
                      >
                        {p.name}
                      </div>
                    ))}
                </div>
              )}
              {newRecipe.ingredients.map((ing, idx) => (
                <div key={idx} style={ingRowS}>
                  <span style={{ fontSize: '12px', flex: 1 }}>{ing.name}</span>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <input
                      type="number"
                      style={{ width: '50px' }}
                      value={ing.amount}
                      onChange={(e) => {
                        const c = [...newRecipe.ingredients];
                        c[idx].amount = e.target.value;
                        setNewRecipe({ ...newRecipe, ingredients: c });
                      }}
                    />
                    <span>{ing.unit}</span>
                    <button
                      onClick={() =>
                        setNewRecipe({
                          ...newRecipe,
                          ingredients: newRecipe.ingredients.filter(
                            (_, i) => i !== idx
                          ),
                        })
                      }
                      style={{
                        color: 'red',
                        border: 'none',
                        background: 'none',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <button style={btnSuccessFull} onClick={handleSaveRecipe}>
                {newRecipe.id ? 'Zaktualizuj' : 'Zapisz'}
              </button>
            </div>
            {recipes
              .filter((r) => r.category === recipeListCategory)
              .map((r) => (
                <div key={r.id} style={productRowS}>
                  <span style={{ fontSize: '13px' }}>{r.name}</span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => {
                        setNewRecipe({
                          ...r,
                          ingredients: r.recipe_ingredients.map((ri) => ({
                            ...ri.products,
                            amount: ri.amount,
                            product_id: ri.product_id,
                          })),
                        });
                      }}
                      style={iconBtn}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm('Usunąć?')) {
                          await supabase
                            .from('recipes')
                            .delete()
                            .eq('id', r.id);
                          fetchData();
                        }
                      }}
                      style={{ ...iconBtn, color: '#ef4444' }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </Modal>
      )}

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
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {products.map((p) => (
              <div key={p.id} style={productRowS}>
                <div style={{ fontSize: '13px' }}>
                  <b>{p.name}</b>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() =>
                      setNewProd({
                        id: p.id,
                        name: p.name,
                        price: (
                          p.price_per_unit * p.last_input_quantity
                        ).toFixed(2),
                        amount: p.last_input_quantity,
                        unit: p.unit,
                      })
                    }
                    style={iconBtn}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('Usunąć?')) {
                        await supabase.from('products').delete().eq('id', p.id);
                        fetchData();
                      }
                    }}
                    style={{ ...iconBtn, color: '#ef4444' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

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
                  fontSize: '14px',
                }}
              >
                {viewingRecipe.instructions}
              </p>
            ) : (
              viewingRecipe.steps?.map((s, i) => (
                <div key={i} style={stepItemS}>
                  <div style={stepCircleS}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: '14px' }}>{s}</div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {activeModal === 'cell' && (
        <Modal
          title="Wybierz danie"
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
          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
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
                  <b>{parseFloat(r.total_cost).toFixed(2)} zł</b>
                </div>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- LOGIN ---
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
        <h2 style={{ color: '#059669', textAlign: 'center', fontSize: '20px' }}>
          🥗 Jedzonko Planer
        </h2>
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
    padding: isMobile ? '15px' : '20px',
    borderRadius: '20px',
    width: isMobile ? '92%' : '92%',
    maxWidth: '600px',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
    zIndex: 1100,
    position: 'relative',
  };
  return (
    <div style={overlayS} onClick={onClose}>
      <div style={mS} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '15px',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '18px' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#94a3b8',
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

// --- STYLE ---
const appContainer = {
  padding: '10px',
  backgroundColor: '#f8fafc',
  minHeight: '100vh',
  fontFamily: '-apple-system, sans-serif',
};
const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '15px',
  background: 'white',
  padding: '10px 15px',
  borderRadius: '15px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
};
const headerMobile = {
  ...headerStyle,
  flexDirection: 'column',
  gap: '10px',
  textAlign: 'center',
};
const logoTitleS = {
  margin: 0,
  color: '#059669',
  fontSize: '18px',
  fontWeight: '800',
};
const logoCircleS = {
  width: '35px',
  height: '35px',
  backgroundColor: '#ecfdf5',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '2px solid #059669',
  fontSize: '20px',
};
const navButtons = {
  display: 'flex',
  gap: '5px',
  flexWrap: 'wrap',
  justifyContent: 'center',
};
const btnTodayActive = {
  background: '#059669',
  color: 'white',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '10px',
  fontWeight: 'bold',
  fontSize: '12px',
};
const btnSec = {
  background: '#f1f5f9',
  color: '#475569',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '12px',
};
const btnPrim = {
  background: '#059669',
  color: 'white',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '10px',
  fontWeight: '800',
  cursor: 'pointer',
  fontSize: '12px',
};
const btnPrimSmall = { ...btnPrim, padding: '6px 10px', fontSize: '11px' };
const btnStats = {
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '10px',
  fontWeight: 'bold',
  fontSize: '12px',
  cursor: 'pointer',
};
const btnDanger = {
  background: '#fef2f2',
  color: '#ef4444',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '10px',
  fontWeight: 'bold',
  fontSize: '12px',
};
const gridStyle = {
  display: 'grid',
  gridTemplateColumns: '80px repeat(6, 1fr)',
  gap: '6px',
};
const layoutGrid = { display: 'grid', gridTemplateColumns: '1fr', gap: '20px' };
const mobileStack = { display: 'flex', flexDirection: 'column', gap: '8px' };
const dayCell = {
  background: 'white',
  padding: '8px',
  borderRadius: '12px',
  textAlign: 'center',
  borderLeft: '4px solid #059669',
  fontWeight: 'bold',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
};
const mobileDayLabel = {
  background: '#1e293b',
  color: 'white',
  padding: '10px',
  borderRadius: '12px',
  fontWeight: 'bold',
  textAlign: 'center',
};
const mealHeader = {
  textAlign: 'center',
  fontWeight: '800',
  color: '#94a3b8',
  fontSize: '10px',
  textTransform: 'uppercase',
};
const cellStyle = {
  minHeight: '85px',
  background: 'white',
  borderRadius: '15px',
  border: '1px solid #e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  position: 'relative',
  overflow: 'hidden',
};
const cellStyleActive = { ...cellStyle, border: 'none' };
const mealContent = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '5px',
  textAlign: 'center',
};
const mealNameS = { fontWeight: '800', fontSize: '10px', padding: '0 4px' };
const daySumCell = {
  background: '#f0fdf4',
  padding: '8px',
  borderRadius: '12px',
  textAlign: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px dashed #059669',
};
const mobileSumLabel = {
  background: '#059669',
  color: 'white',
  padding: '10px',
  borderRadius: '12px',
  fontWeight: 'bold',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};
const weekSummaryPanel = {
  margin: '15px 0',
  background: 'white',
  padding: '15px',
  borderRadius: '20px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
  border: '2px solid #059669',
};
const btnViewSmall = {
  background: 'rgba(255,255,255,0.4)',
  color: '#1e293b',
  border: '1px solid rgba(0,0,0,0.1)',
  padding: '3px 6px',
  borderRadius: '5px',
  fontSize: '9px',
  cursor: 'pointer',
  backdropFilter: 'blur(3px)',
};
const btnDelSmall = {
  background: 'rgba(239, 68, 68, 0.8)',
  color: 'white',
  border: 'none',
  borderRadius: '5px',
  width: '18px',
  height: '18px',
  fontSize: '10px',
};
const shoppingPanel = {
  marginTop: '20px',
  background: 'white',
  padding: '15px',
  borderRadius: '18px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
};
const shoppingGrid = {
  display: 'grid',
  gridTemplateColumns:
    window.innerWidth < 600 ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '10px',
};
const shoppingItem = {
  padding: '12px',
  borderRadius: '12px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
};
const inputS = {
  width: '100%',
  padding: '10px',
  marginBottom: '8px',
  borderRadius: '10px',
  border: '1px solid #e2e8f0',
  fontSize: '14px',
};
const btnSuccessFull = {
  background: '#059669',
  color: 'white',
  border: 'none',
  padding: '12px',
  borderRadius: '12px',
  width: '100%',
  fontWeight: '800',
  marginTop: '10px',
};
const btnFilter = {
  background: '#f1f5f9',
  color: '#64748b',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '11px',
};
const btnFilterActive = { ...btnFilter, background: '#059669', color: 'white' };
const filterBar = {
  display: 'flex',
  gap: '6px',
  marginBottom: '12px',
  overflowX: 'auto',
  paddingBottom: '4px',
};
const productRowS = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px',
  borderBottom: '1px solid #f1f5f9',
  alignItems: 'center',
};
const recipeListItem = {
  padding: '10px',
  borderBottom: '1px solid #f1f5f9',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};
const searchResultsS = {
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  marginBottom: '15px',
};
const searchItemS = { padding: '10px', borderBottom: '1px solid #f1f5f9' };
const ingRowS = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 0',
  alignItems: 'center',
  borderBottom: '1px dashed #e2e8f0',
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
  background: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
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
  padding: '30px',
  borderRadius: '25px',
  width: '300px',
};
const loadingStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  color: '#059669',
  fontSize: '18px',
  fontWeight: 'bold',
};
const mobileMealTag = {
  position: 'absolute',
  top: '4px',
  left: '8px',
  fontSize: '8px',
  color: '#94a3b8',
  fontWeight: 'bold',
  textTransform: 'uppercase',
};
const formBoxS = {
  background: '#f8fafc',
  padding: '12px',
  borderRadius: '15px',
  marginBottom: '15px',
  border: '1px solid #e2e8f0',
};
const stepItemS = {
  padding: '10px',
  background: '#f0fdf4',
  borderRadius: '10px',
  borderLeft: '4px solid #059669',
  marginBottom: '8px',
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
};
const stepCircleS = {
  width: '22px',
  height: '22px',
  background: '#059669',
  color: 'white',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 'bold',
  fontSize: '11px',
  flexShrink: 0,
};
const fileLabelS = {
  display: 'block',
  padding: '10px',
  background: '#f1f5f9',
  border: '2px dashed #cbd5e1',
  borderRadius: '10px',
  textAlign: 'center',
  cursor: 'pointer',
  color: '#475569',
  fontWeight: 'bold',
  fontSize: '12px',
  marginBottom: '10px',
};
const btnCartAddSmall = {
  background: '#e0f2fe',
  color: '#0369a1',
  border: 'none',
  padding: '4px 8px',
  borderRadius: '6px',
  fontSize: '10px',
  fontWeight: 'bold',
  cursor: 'pointer',
};
const statBoxS = {
  background: '#f8fafc',
  padding: '15px',
  borderRadius: '15px',
  border: '1px solid #e2e8f0',
  marginBottom: '15px',
};
const statRowS = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderBottom: '1px solid #f1f5f9',
  alignItems: 'center',
};
const statLabelS = {
  margin: '0 0 10px 0',
  color: '#475569',
  fontSize: '14px',
  borderBottom: '2px solid #059669',
  display: 'inline-block',
};
