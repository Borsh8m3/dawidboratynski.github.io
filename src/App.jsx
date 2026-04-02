import 'regenerator-runtime/runtime'; // Wymagane przez react-speech-recognition
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
);

const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();

const MEAL_TYPES = ['Śniadanie', 'Lunch', 'Obiad', 'Podwieczorek', 'Kolacja'];
const DAYS = [
  'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela',
];

const sharedGradient = 'linear-gradient(135deg, #dcfce7 0%, #e2e8f0 100%)';
const MEAL_COLORS = {
  'Śniadanie': sharedGradient, 
  'Lunch': sharedGradient,     
  'Obiad': sharedGradient,     
  'Podwieczorek': sharedGradient, 
  'Kolacja': sharedGradient    
};

const renderStepWithIngredients = (text, ingredients) => {
  if (!text || !ingredients || ingredients.length === 0) return text;
  let parts = [{ text: text, isIng: false }];

  ingredients.forEach((ri) => {
    const name = ri.products?.name || ri.name; 
    if (!name) return;
    const words = name.split(' ').filter(w => w.length > 2);
    const searchWord = words.length > 0 ? words[0] : name;
    const minLen = Math.max(3, searchWord.length - 2);
    const stem = searchWord.toLowerCase().substring(0, minLen);
    const safeStem = stem.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    const newParts = [];
    parts.forEach(part => {
      if (part.isIng) {
        newParts.push(part); 
        return;
      }
      const regex = new RegExp(`(${safeStem}[a-ząćęłńóśźż]*)`, 'gi');
      const splits = part.text.split(regex);
      splits.forEach(s => {
        if (!s) return;
        if (s.toLowerCase().startsWith(stem)) {
          const displayUnit = ri.products?.unit || ri.unit || '';
          newParts.push({ text: s, isIng: true, ri: { amount: ri.amount, unit: displayUnit } });
        } else {
          newParts.push({ text: s, isIng: false });
        }
      });
    });
    parts = newParts;
  });

  return parts.map((p, i) => {
    if (p.isIng) {
      return (
        <span key={i} style={{
          color: '#059669', fontWeight: '800', backgroundColor: '#ecfdf5',
          padding: '4px 10px', borderRadius: '16px', whiteSpace: 'nowrap',
          border: '1px solid #a7f3d0'
        }}>
          {p.text} ({p.ri.amount} {p.ri.unit})
        </span>
      );
    }
    return <span key={i}>{p.text}</span>;
  });
};

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [mealPlan, setMealPlan] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  const [manualCart, setManualCart] = useState([]);
  const [checkedItems, setCheckedItems] = useState({});

  const [activeModal, setActiveModal] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [viewingRecipe, setViewingRecipe] = useState(null);
  const [viewMode, setViewMode] = useState('desc');
  const [filterCategory, setFilterCategory] = useState('');
  const [recipeListCategory, setRecipeListCategory] = useState(''); 
  const [statTab, setStatTab] = useState('summary'); 

  const [cookingStep, setCookingStep] = useState(0);
  const [isVoiceActive, setIsVoiceActive] = useState(false); 
  const [isMicPaused, setIsMicPaused] = useState(false);     
  const [isTtsActive, setIsTtsActive] = useState(false);     
  const [repeatTrigger, setRepeatTrigger] = useState(0); 
  
  const isVoiceActiveRef = useRef(isVoiceActive);
  const isMicPausedRef = useRef(isMicPaused);
  const isTtsActiveRef = useRef(isTtsActive);
  const stepsLengthRef = useRef(0); 

  const [isAiLoading, setIsAiLoading] = useState(false); 
  const [showAiPanel, setShowAiPanel] = useState(false); 
  const [aiUrl, setAiUrl] = useState(''); 

  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false); 
  const [cartModalTab, setCartModalTab] = useState('recipes'); 
  
  const [commentText, setCommentText] = useState('');
  const [commentingMealId, setCommentingMealId] = useState(null);

  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef(null);

  const [newProd, setNewProd] = useState({ id: null, name: '', price: '', amount: '', unit: 'g' });
  const [newRecipe, setNewRecipe] = useState({ id: null, name: '', category: 'Obiad', instructions: '', image_url: '', steps: [], ingredients: [], is_favorite: false, portions: 1 });
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = useCallback(() => supabase.auth.signOut(), []);

  // --- LOGIKA SKOKU DO DATY ---
  const jumpToDate = (dateStr) => {
    const selected = new Date(dateStr);
    const today = new Date();
    
    const getMonday = (d) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));
      monday.setHours(0,0,0,0);
      return monday;
    };

    const startOfSelectedWeek = getMonday(selected);
    const startOfCurrentWeek = getMonday(today);
    const diffInMs = startOfSelectedWeek.getTime() - startOfCurrentWeek.getTime();
    const offset = Math.round(diffInMs / (7 * 24 * 60 * 60 * 1000));
    
    setWeekOffset(offset);
    setActiveModal(null);
  };

  const handleMicPauseAndAction = useCallback(() => {
    setIsMicPaused(true);
    SpeechRecognition.stopListening();
    if (!isTtsActiveRef.current) {
      setTimeout(() => {
        setIsMicPaused(false);
        if (isVoiceActiveRef.current) SpeechRecognition.startListening({ continuous: true, language: 'pl-PL' });
      }, 1500);
    }
  }, []);

  const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } = useSpeechRecognition({ commands: [] });

  useEffect(() => {
    if (isMicPaused) resetTranscript();
  }, [isMicPaused, resetTranscript]);

  useEffect(() => {
    if (!isVoiceActive || isMicPaused || !transcript) return;
    const lowerTranscript = transcript.toLowerCase();
    const hasWord = (words) => words.some(w => lowerTranscript.includes(w));
    if (hasWord(['dalej', 'następny', 'następna', 'kolejny', 'kolejna', 'dali', 'działa'])) {
      setCookingStep(prev => Math.min(prev + 1, Math.max(0, stepsLengthRef.current - 1)));
      resetTranscript();
      handleMicPauseAndAction();
    } else if (hasWord(['wstecz', 'poprzedni', 'poprzednia', 'cofnij', 'wróć'])) {
      setCookingStep(prev => Math.max(prev - 1, 0));
      resetTranscript();
      handleMicPauseAndAction();
    } else if (hasWord(['powtórz', 'jeszcze raz', 'czytaj'])) {
      setRepeatTrigger(prev => prev + 1);
      resetTranscript();
      handleMicPauseAndAction();
    } else if (hasWord(['zamknij', 'koniec', 'zakończ'])) {
      setIsVoiceActive(false); setIsMicPaused(false); window.speechSynthesis.cancel(); SpeechRecognition.stopListening(); resetTranscript(); setActiveModal('view-recipe');
    }
  }, [transcript, isVoiceActive, isMicPaused, handleMicPauseAndAction, resetTranscript]);

  useEffect(() => {
    const handleClickOutside = (e) => { if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) setShowSearchDropdown(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    document.title = "Jedzonko Planer 🥗";
    const handleResize = () => { setIsMobile(window.innerWidth < 900); setIsLandscape(window.innerWidth > window.innerHeight); };
    window.addEventListener('resize', handleResize);
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => { subscription.unsubscribe(); window.removeEventListener('resize', handleResize); };
  }, []);

  useEffect(() => { if (session) fetchData(); }, [session, weekOffset]);
  useEffect(() => { stepsLengthRef.current = viewingRecipe?.steps?.length || 0; }, [viewingRecipe]);
  useEffect(() => { isTtsActiveRef.current = isTtsActive; isMicPausedRef.current = isMicPaused; isVoiceActiveRef.current = isVoiceActive; }, [isTtsActive, isMicPaused, isVoiceActive]);

  useEffect(() => {
    if (activeModal === 'cooking-mode' && isTtsActive && viewingRecipe?.steps) {
      window.speechSynthesis.cancel(); setIsMicPaused(true); SpeechRecognition.stopListening();
      const stepText = viewingRecipe.steps[cookingStep];
      if (stepText) {
        const u = new SpeechSynthesisUtterance(`Krok ${cookingStep + 1}. ${stepText}`);
        u.lang = 'pl-PL'; u.onend = () => { setIsMicPaused(false); if (isVoiceActiveRef.current) SpeechRecognition.startListening({ continuous: true, language: 'pl-PL' }); };
        u.onerror = u.onend; setTimeout(() => window.speechSynthesis.speak(u), 150);
      } else { setIsMicPaused(false); if (isVoiceActiveRef.current) SpeechRecognition.startListening({ continuous: true, language: 'pl-PL' }); }
    }
  }, [cookingStep, activeModal, isTtsActive, viewingRecipe, repeatTrigger]);

  const toggleVoiceMode = () => {
    if (!browserSupportsSpeechRecognition) return alert("Brak wsparcia mowy.");
    if (isVoiceActive) { setIsVoiceActive(false); setIsMicPaused(false); SpeechRecognition.stopListening(); window.speechSynthesis.cancel(); }
    else { setIsVoiceActive(true); setIsMicPaused(false); resetTranscript(); SpeechRecognition.startListening({ continuous: true, language: 'pl-PL' }); }
  };

  async function fetchData() {
    const { data: prods } = await supabase.from('products').select('*').order('name');
    const { data: recs } = await supabase.from('recipes').select('*, recipe_ingredients(*, products(*))').order('name');
    const { data: plan } = await supabase.from('meal_plan').select('*, recipes(*)');
    setProducts(prods || []); setRecipes(recs || []); setMealPlan(plan || []);
  }

  const weekDates = useMemo(() => {
    const now = new Date(); const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) + weekOffset * 7;
    return DAYS.map((name, i) => {
      const d = new Date(new Date().setDate(diff + i));
      return { name, fullDate: d.toISOString().split('T')[0], displayDate: d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) };
    });
  }, [weekOffset]);

  const advancedStats = useMemo(() => {
    const monthlySpending = {}; const ingredientStats = {}; 
    const mealTypeCosts = { 'Śniadanie': 0, 'Lunch': 0, 'Obiad': 0, 'Podwieczorek': 0, 'Kolacja': 0 };
    let currentMonthCost = 0; const currentMonthLabel = new Date().toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    mealPlan.forEach((meal) => {
      const recipe = recipes.find((r) => r.id === meal.recipe_id); if (!recipe) return;
      const cost = parseFloat(recipe.total_cost || 0); const dateObj = new Date(meal.date);
      const monthLabel = dateObj.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
      monthlySpending[monthLabel] = (monthlySpending[monthLabel] || 0) + cost;
      if (monthLabel === currentMonthLabel) currentMonthCost += cost;
      if (mealTypeCosts[meal.meal_type] !== undefined) mealTypeCosts[meal.meal_type] += cost;
      recipe.recipe_ingredients?.forEach((ri) => {
        const p = ri.products; if (!p) return;
        if (!ingredientStats[p.name]) ingredientStats[p.name] = { count: 0, totalCost: 0, unit: p.unit };
        ingredientStats[p.name].count += 1; ingredientStats[p.name].totalCost += p.price_per_unit * ri.amount;
      });
    });
    const topByCount = Object.entries(ingredientStats).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const topByCost = Object.entries(ingredientStats).sort((a, b) => b[1].totalCost - a[1].totalCost).slice(0, 6);
    const uniqueDays = new Set(mealPlan.map(m => m.date)).size;
    const maxMonthly = Math.max(0, ...Object.values(monthlySpending));
    const maxMealType = Math.max(0, ...Object.values(mealTypeCosts));
    const maxIngCost = topByCost.length > 0 ? topByCost[0][1].totalCost : 0;
    return {
      monthly: Object.entries(monthlySpending).reverse(), topByCount, topByCost,
      mealTypeCosts: Object.entries(mealTypeCosts).sort((a,b) => b[1] - a[1]),
      currentMonthLabel, currentMonthCost: currentMonthCost.toFixed(2),
      avgDailyCost: uniqueDays > 0 ? (currentMonthCost / uniqueDays).toFixed(2) : 0,
      plannedMealsCount: mealPlan.length,
      maxMonthly, maxMealType, maxIngCost
    };
  }, [mealPlan, recipes]);

  const finalShoppingList = useMemo(() => {
    const combined = {};
    weekDates.forEach((d) => {
      mealPlan.filter((m) => m.date === d.fullDate).forEach((m) => {
        recipes.find((rec) => rec.id === m.recipe_id)?.recipe_ingredients?.forEach((ri) => {
          const p = ri.products; if (!p) return;
          const key = `${p.name}-${p.unit}`;
          if (!combined[key]) combined[key] = { id: p.id, name: p.name, amount: 0, unit: p.unit, cost: 0, pricePU: p.price_per_unit };
          combined[key].amount += parseFloat(ri.amount || 0);
        });
      });
    });
    manualCart.forEach((item) => {
      const key = `${item.name}-${item.unit}`;
      if (!combined[key]) combined[key] = { id: item.id, name: item.name, amount: 0, unit: item.unit, cost: 0, pricePU: item.pricePU };
      combined[key].amount += parseFloat(item.amount);
    });
    return Object.values(combined).map((it) => ({ ...it, cost: (it.pricePU * it.amount).toFixed(2) }));
  }, [weekDates, mealPlan, recipes, manualCart]);

  const dailyCosts = useMemo(() => {
    const daily = {}; let weeklyTotal = 0;
    weekDates.forEach((d) => {
      let daySum = 0;
      mealPlan.filter((m) => m.date === d.fullDate).forEach((m) => {
        const r = recipes.find((rec) => rec.id === m.recipe_id);
        if (r?.total_cost) daySum += parseFloat(r.total_cost);
      });
      daily[d.fullDate] = daySum.toFixed(2); weeklyTotal += daySum;
    });
    return { daily, weeklyTotal: weeklyTotal.toFixed(2) };
  }, [weekDates, mealPlan, recipes]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewRecipe((prev) => ({ ...prev, image_url: reader.result }));
      reader.readAsDataURL(file);
    }
  };

  const processAiResponse = (data) => {
    if (!data.candidates || data.candidates.length === 0) return;
    let jsonText = data.candidates[0].content.parts[0].text.replace(/```json\n?/gi, '').replace(/```/gi, '').trim();
    const aiRecipe = JSON.parse(jsonText);
    const mappedIngredients = (aiRecipe.ingredients || []).map(aiIng => {
      const aiNameLower = aiIng.name.toLowerCase();
      let found = products.find(p => p.name.toLowerCase() === aiNameLower || p.name.toLowerCase().includes(aiNameLower));
      if (found) return { ...found, amount: aiIng.amount || 100 };
      return { id: null, name: `⚠️ ${aiIng.name}`, amount: aiIng.amount || 100, unit: aiIng.unit || 'g' };
    });
    setNewRecipe(prev => ({
      ...prev, name: aiRecipe.name || prev.name, instructions: aiRecipe.instructions || prev.instructions,
      steps: aiRecipe.steps || prev.steps, ingredients: [...prev.ingredients, ...mappedIngredients],
      portions: aiRecipe.portions || prev.portions || 1,
    }));
  };

  const handleAiRecipeScan = async (e) => {
    const file = e.target.files[0]; if (!file || !GEMINI_API_KEY) return;
    setIsAiLoading(true);
    try {
      const base64 = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result.split(',')[1]); r.readAsDataURL(file); });
      const prompt = `Jesteś ekspertem kulinarnym. Przeanalizuj zdjęcie przepisu. Zwróć JSON: {name, instructions, portions, steps:[], ingredients:[{name, amount, unit}]}`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64 } }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      processAiResponse(await response.json());
    } catch (err) { alert("Błąd AI"); } finally { setIsAiLoading(false); setShowAiPanel(false); }
  };

  const handleAiRecipeFromUrl = async () => {
    if (!aiUrl || !GEMINI_API_KEY) return;
    setIsAiLoading(true);
    try {
      const prompt = `Przeanalizuj przepis z URL: ${aiUrl}. Zwróć JSON: {name, instructions, portions, steps:[], ingredients:[{name, amount, unit}]}`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      processAiResponse(await response.json()); setAiUrl(''); setShowAiPanel(false);
    } catch (err) { alert("Błąd AI"); } finally { setIsAiLoading(false); }
  };

  const handleSaveRecipe = async () => {
    if (!newRecipe.name) return;
    const validIngredients = newRecipe.ingredients.filter(ing => ing.id || ing.product_id);
    const tCost = validIngredients.reduce((s, i) => s + (parseFloat(i.price_per_unit || i.products?.price_per_unit || 0) * parseFloat(i.amount || 0)), 0).toFixed(2);
    const rData = { name: newRecipe.name, category: newRecipe.category, total_cost: tCost, instructions: newRecipe.instructions, steps: newRecipe.steps, image_url: newRecipe.image_url, is_favorite: newRecipe.is_favorite, portions: newRecipe.portions || 1 };
    let rId = newRecipe.id;
    if (newRecipe.id) { await supabase.from('recipes').update(rData).eq('id', newRecipe.id); await supabase.from('recipe_ingredients').delete().eq('recipe_id', newRecipe.id); }
    else { const { data } = await supabase.from('recipes').insert([rData]).select().single(); rId = data.id; }
    await supabase.from('recipe_ingredients').insert(validIngredients.map(ing => ({ recipe_id: rId, product_id: ing.id || ing.product_id, amount: ing.amount })));
    setNewRecipe({ id: null, name: '', category: 'Obiad', instructions: '', image_url: '', steps: [], ingredients: [], is_favorite: false, portions: 1 });
    setShowRecipeForm(false); fetchData();
  };

  const handleSaveProduct = async () => {
    const pPerU = parseFloat(newProd.price) / parseFloat(newProd.amount);
    const d = { name: newProd.name, price_per_unit: pPerU, unit: newProd.unit, last_input_quantity: parseFloat(newProd.amount) };
    if (newProd.id) await supabase.from('products').update(d).eq('id', newProd.id);
    else await supabase.from('products').insert([d]);
    setNewProd({ id: null, name: '', price: '', amount: '', unit: 'g' });
    setShowProductForm(false); fetchData();
  };

  const handleEditRecipeDirectly = (recipeInfo) => {
    const r = recipes.find(r => r.id === recipeInfo.id); if (!r) return;
    setNewRecipe({ ...r, portions: r.portions || 1, ingredients: (r.recipe_ingredients || []).map(ri => ({ ...ri.products, amount: ri.amount, product_id: ri.product_id })) });
    setRecipeListCategory(r.category || 'Obiad'); setShowRecipeForm(true); setActiveModal('recipe');
  };

  if (loading) return <div style={loadingStyle}>🍳 Ładowanie...</div>;
  if (!session) return <LoginView />;

  return (
    <div style={appContainer}>
      <style>{`
        @keyframes slideUpImmersive { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeInOverlay { from { background: rgba(15, 23, 42, 0); backdrop-filter: blur(0px); } to { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); } }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .sheet-container { position: fixed; bottom: 0; left: 0; right: 0; z-index: 1200; display: flex; justify-content: center; align-items: flex-end; height: 100vh; animation: fadeInOverlay 0.3s forwards; }
        .sheet-card { width: 100%; max-width: 800px; height: 92vh; background: #fff; border-radius: 40px 40px 0 0; display: flex; flex-direction: column; animation: slideUpImmersive 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; overflow: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,0.15); }
        .sheet-header { padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; flex-shrink: 0; }
        .sheet-content { flex: 1; padding: 25px; overflow-y: auto; }
        .drag-handle { width: 50px; height: 6px; background: #cbd5e1; border-radius: 10px; margin: 15px auto 0 auto; flex-shrink: 0; }
        .list-card { background: #f8fafc; border-radius: 24px; padding: 20px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
        .list-card-title { font-weight: 900; font-size: 16px; color: #0f172a; line-height: 1.4; }
        .list-card-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 5px; }
        .compact-list-row { background: #f8fafc; border-radius: 20px; padding: 14px 18px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer; transition: all 0.2s; }
        .quick-date-btn { background: #f1f5f9; border: none; padding: 15px; border-radius: 20px; font-weight: 800; color: #475569; cursor: pointer; text-align: left; display: flex; justify-content: space-between; align-items: center; }
        .quick-date-btn:hover { background: #e2e8f0; }
      `}</style>

      <header style={isMobile ? headerMobile : headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={logoCircleS}>🥗</div>
          <div>
            <h1 style={logoTitleS}>Jedzonko Planer</h1>
            <small style={{ color: '#64748b', fontWeight: '800' }}>{weekDates[0].displayDate} - {weekDates[6].displayDate}</small>
          </div>
        </div>
        <div style={navButtons}>
          <button onClick={() => setWeekOffset(p => p - 1)} style={btnSec}>⬅</button>
          <button onClick={() => setActiveModal('calendar-jump')} style={btnSec} title="Wybierz tydzień">📅</button>
          <button onClick={() => setWeekOffset(0)} style={weekOffset === 0 ? btnTodayActive : btnSec}>Dziś</button>
          <button onClick={() => setWeekOffset(p => p + 1)} style={btnSec}>➡</button>
          <button onClick={() => { setStatTab('summary'); setActiveModal('stats'); }} style={btnStats}>📈 Statystyki</button>
          <button onClick={() => setActiveModal('product')} style={btnSec}>📦 Baza</button>
          <button onClick={() => setActiveModal('recipe')} style={btnPrim}>👨‍🍳 Przepisy</button>
          <button onClick={handleLogout} style={btnDanger}>Wyloguj</button>
        </div>
      </header>

      {/* --- WIDOK KALENDARZA (GLOWNY) --- */}
      <div style={layoutGrid}>
        <div style={isMobile ? mobileStack : gridStyle}>
          {!isMobile && <div />}
          {!isMobile && [...MEAL_TYPES, 'Suma'].map((m) => (<div key={m} style={mealHeader}>{m}</div>))}
          {weekDates.map((day) => (
            <React.Fragment key={day.fullDate}>
              <div style={isMobile ? mobileDayLabel : dayCell}>
                <b style={{ fontSize: '13px' }}>{day.name}</b>
                <small style={{ fontSize: '11px', color: isMobile ? '#cbd5e1' : '#64748b', marginTop: '4px' }}>{day.displayDate}</small>
              </div>
              {MEAL_TYPES.map((type) => {
                const m = mealPlan.find((p) => p.date === day.fullDate && p.meal_type === type && p.recipes);
                const hasImage = Boolean(m?.recipes?.image_url);
                const bgStyle = hasImage ? `linear-gradient(to bottom, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.85) 100%), url(${m.recipes.image_url})` : MEAL_COLORS[type];
                return (
                  <div key={`${day.fullDate}-${type}`} style={{ ...(m ? cellStyleActive : cellStyleEmpty), backgroundImage: m ? bgStyle : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} onClick={() => { if (!m) { setSelectedCell({ date: day.fullDate, type }); setFilterCategory(type); setActiveModal('cell'); } }}>
                    {isMobile && <span style={{ ...mobileMealTag, color: hasImage ? 'white' : '#475569' }}>{type}</span>}
                    {m ? (
                      <div style={mealContent}>
                        <div style={{ ...mealNameS, color: hasImage ? 'white' : '#1e293b' }}>{m.recipes.is_favorite && '⭐ '}{m.recipes.name}</div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' }}>
                          <button style={btnActionSmall} onClick={(e) => { e.stopPropagation(); setCommentingMealId(m.id); setCommentText(m.comment || ''); setActiveModal('meal-comment'); }}>📝</button>
                          <button style={btnActionSmall} onClick={(e) => { e.stopPropagation(); setViewingRecipe(m.recipes); setViewMode('desc'); setActiveModal('view-recipe'); }}>ℹ️</button>
                          <button style={btnActionSmall} onClick={(e) => { e.stopPropagation(); if (confirm('Usunąć z planu?')) { supabase.from('meal_plan').delete().eq('id', m.id).then(() => fetchData()); } }}>✕</button>
                        </div>
                      </div>
                    ) : (<div style={emptyCellPlus}>+</div>)}
                  </div>
                );
              })}
              <div style={isMobile ? mobileSumLabel : daySumCell}>
                {isMobile && <span style={{ fontSize: '11px', opacity: 0.9 }}>SUMA DNIA:</span>}
                <b style={{ fontSize: '15px' }}>{dailyCosts.daily[day.fullDate]} zł</b>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* --- PODSUMOWANIE TYGODNIA --- */}
      <div style={weekSummaryPanel}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ color: '#64748b', fontSize: '15px', fontWeight: '900', letterSpacing: '1px' }}>CAŁKOWITY KOSZT TYGODNIA</span>
          <div style={{ fontSize: '38px', fontWeight: '900', color: '#059669', marginTop: '5px' }}>{dailyCosts.weeklyTotal} zł</div>
        </div>
      </div>

      {/* --- LISTA ZAKUPÓW --- */}
      <div style={shoppingPanel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: '#059669', margin: 0, fontSize: '20px', fontWeight: '900' }}>🛒 Lista zakupów</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={btnPrimSmall} onClick={() => setActiveModal('add-to-cart')}>Dodaj +</button>
            <button style={{ ...btnSec, padding: '8px 14px', fontSize: '12px' }} onClick={() => { setManualCart([]); setCheckedItems({}); }}>Reset</button>
          </div>
        </div>
        <div style={shoppingGrid}>
          {finalShoppingList.map((i) => {
            const isChecked = checkedItems[i.name];
            return (
              <div key={i.name} onClick={() => setCheckedItems((p) => ({ ...p, [i.name]: !p[i.name] }))} style={{ ...shoppingItem, opacity: isChecked ? 0.5 : 1, background: isChecked ? '#f0fdf4' : '#f8fafc' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', border: '2px solid #059669', borderRadius: '8px', background: isChecked ? '#059669' : 'transparent', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isChecked && '✓'}</div>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '14px', textDecoration: isChecked ? 'line-through' : 'none' }}>{i.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{i.amount} {i.unit}</div>
                  </div>
                </div>
                <b style={{ color: '#059669', fontSize: '14px', background: '#fff', padding: '4px 8px', borderRadius: '10px' }}>{i.cost} zł</b>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- MODALE --- */}

      {/* MODAL: SKOK DO DATY / KALENDARZ */}
      {activeModal === 'calendar-jump' && (
        <div className="sheet-container" onClick={() => setActiveModal(null)}>
          <div className="sheet-card" style={{ height: 'auto', paddingBottom: '40px' }} onClick={e => e.stopPropagation()}>
            <div className="drag-handle"></div>
            <div className="sheet-header">
              <h2 style={{margin:0, fontSize: '22px'}}>📅 Skocz do daty</h2>
              <button onClick={() => setActiveModal(null)} style={iconBtn}>✕</button>
            </div>
            <div className="sheet-content">
              <p style={{color: '#64748b', fontWeight: 'bold', marginBottom: '15px'}}>Wybierz konkretny dzień:</p>
              <input 
                type="date" 
                style={{...inputS, fontSize: '18px'}} 
                onChange={(e) => jumpToDate(e.target.value)}
              />
              
              <div style={{marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <p style={{color: '#64748b', fontWeight: 'bold', marginBottom: '5px'}}>Szybkie skróty:</p>
                <button className="quick-date-btn" onClick={() => {
                  const d = new Date(); d.setMonth(d.getMonth() - 1); jumpToDate(d.toISOString().split('T')[0]);
                }}><span>Miesiąc temu</span> <span>🕒</span></button>
                
                <button className="quick-date-btn" onClick={() => {
                  const d = new Date(); d.setMonth(d.getMonth() - 3); jumpToDate(d.toISOString().split('T')[0]);
                }}><span>3 miesiące temu</span> <span>⏳</span></button>
                
                <button className="quick-date-btn" onClick={() => {
                  const d = new Date(); d.setMonth(d.getMonth() - 6); jumpToDate(d.toISOString().split('T')[0]);
                }}><span>Pół roku temu</span> <span>🏛️</span></button>

                <button className="quick-date-btn" onClick={() => {
                  const d = new Date(); d.setFullYear(d.getFullYear() - 1); jumpToDate(d.toISOString().split('T')[0]);
                }}><span>Rok temu</span> <span>📅</span></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WYBÓR POSIŁKU (PRZYPISYWANIE DO DNIA) */}
      {activeModal === 'cell' && (
        <div className="sheet-container" onClick={() => setActiveModal(null)}>
          <div className="sheet-card" onClick={e => e.stopPropagation()}>
            <div className="drag-handle"></div>
            <div className="sheet-header">
              <h2 style={{margin:0, fontSize: '22px'}}>Plan: {selectedCell?.type}</h2>
              <button onClick={() => setActiveModal(null)} style={iconBtn}>✕</button>
            </div>
            <div className="sheet-content hide-scrollbar">
              <div style={filterBar}>
                {['Wszystkie', ...MEAL_TYPES].map(cat => (
                  <button key={cat} onClick={() => setFilterCategory(cat === 'Wszystkie' ? '' : cat)} style={filterCategory === (cat === 'Wszystkie' ? '' : cat) ? btnFilterActive : btnFilter}>
                    {cat}
                  </button>
                ))}
              </div>
              <div style={{marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                {recipes.filter((r) => !filterCategory || r.category === filterCategory).sort((a, b) => b.is_favorite - a.is_favorite).map((r) => (
                  <div key={r.id} className="list-card" onClick={async () => { 
                    await supabase.from('meal_plan').insert([{ date: selectedCell.date, meal_type: selectedCell.type, recipe_id: r.id }]); 
                    setActiveModal(null); fetchData(); 
                  }}>
                    <div className="list-card-title">{r.is_favorite && '⭐ '}{r.name}</div>
                    <div className="list-card-actions">
                      <span style={{color: '#64748b', fontSize: '13px', fontWeight: 'bold'}}>{r.category}</span>
                      <b style={{color: '#059669', background: '#ecfdf5', padding: '6px 12px', borderRadius: '14px'}}>{parseFloat(r.total_cost).toFixed(2)} zł</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NOTATKA DO POSIŁKU */}
      {activeModal === 'meal-comment' && (
        <div className="sheet-container" onClick={() => setActiveModal(null)}>
          <div className="sheet-card" style={{ height: 'auto', paddingBottom: '30px' }} onClick={e => e.stopPropagation()}>
            <div className="drag-handle"></div>
            <div className="sheet-header">
              <h2 style={{margin:0, fontSize: '22px'}}>📝 Notatka</h2>
              <button onClick={() => setActiveModal(null)} style={iconBtn}>✕</button>
            </div>
            <div className="sheet-content">
              <textarea
                style={{ ...inputS, minHeight: '160px', padding: '25px', fontSize: '16px' }}
                placeholder="Jak wyszło? Jakieś uwagi?"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button style={{...btnSuccessFull, marginTop: '20px'}} onClick={async () => {
                await supabase.from('meal_plan').update({ comment: commentText }).eq('id', commentingMealId);
                setActiveModal(null); fetchData();
              }}>Zapisz notatkę</button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUKTY */}
      {activeModal === 'product' && (
        <div className="sheet-container" onClick={() => {setActiveModal(null); setShowProductForm(false);}}>
          <div className="sheet-card" onClick={e => e.stopPropagation()}>
            <div className="drag-handle"></div>
            <div className="sheet-header">
              <h2 style={{margin:0, fontSize: '22px'}}>📦 Produkty</h2>
              <button onClick={() => setActiveModal(null)} style={iconBtn}>✕</button>
            </div>
            <div className="sheet-content hide-scrollbar">
              {!showProductForm ? (
                <>
                  <button style={{...btnSuccessFull, marginBottom: '25px'}} onClick={() => { setNewProd({ id: null, name: '', price: '', amount: '', unit: 'g' }); setShowProductForm(true); }}>+ Nowy produkt</button>
                  {products.map(p => (
                    <div key={p.id} className="list-card">
                      <div className="list-card-title">{p.name}</div>
                      <div className="list-card-actions">
                        <span style={{color: '#64748b', fontWeight: 'bold'}}>{(p.price_per_unit * p.last_input_quantity).toFixed(2)} zł / {p.last_input_quantity}{p.unit}</span>
                        <div style={{display:'flex', gap:'8px'}}>
                          <button onClick={() => { setNewProd({ id: p.id, name: p.name, price: (p.price_per_unit * p.last_input_quantity).toFixed(2), amount: p.last_input_quantity, unit: p.unit }); setShowProductForm(true); }} style={{...btnActionSmall, background: '#e2e8f0', color: '#000'}}>✏️</button>
                          <button onClick={() => confirm('Usunąć?') && supabase.from('products').delete().eq('id', p.id).then(() => fetchData())} style={{...btnActionSmall, background: '#fee2e2', color: '#ef4444'}}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{paddingBottom: '30px'}}>
                  <button onClick={() => setShowProductForm(false)} style={btnSec}>⬅ Wróć</button>
                  <div style={{marginTop:'25px'}}>
                    <input style={inputS} placeholder="Nazwa produktu" value={newProd.name} onChange={e => setNewProd({...newProd, name: e.target.value})} />
                    <div style={{display:'grid', gridTemplateColumns: '1fr 1fr', gap:'12px'}}>
                      <input style={inputS} type="number" placeholder="Cena" value={newProd.price} onChange={e => setNewProd({...newProd, price: e.target.value})} />
                      <input style={inputS} type="number" placeholder="Ilość" value={newProd.amount} onChange={e => setNewProd({...newProd, amount: e.target.value})} />
                    </div>
                    <select style={inputS} value={newProd.unit} onChange={e => setNewProd({...newProd, unit: e.target.value})}><option value="g">gramy (g)</option><option value="ml">mililitry (ml)</option><option value="szt">sztuki (szt)</option></select>
                    <button style={btnSuccessFull} onClick={handleSaveProduct}>Zapisz produkt</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRZEPISY */}
      {activeModal === 'recipe' && (
        <div className="sheet-container" onClick={() => {setActiveModal(null); setShowRecipeForm(false);}}>
          <div className="sheet-card" onClick={e => e.stopPropagation()}>
            <div className="drag-handle"></div>
            <div className="sheet-header">
              <h2 style={{margin:0, fontSize: '22px'}}>👨‍🍳 Przepisy</h2>
              <button onClick={() => setActiveModal(null)} style={iconBtn}>✕</button>
            </div>
            <div className="sheet-content hide-scrollbar">
              {!showRecipeForm ? (
                <>
                  <button style={{...btnSuccessFull, marginBottom: '25px'}} onClick={() => { setNewRecipe({ id: null, name: '', category: 'Obiad', instructions: '', image_url: '', steps: [], ingredients: [], is_favorite: false, portions: 1 }); setShowRecipeForm(true); }}>+ Dodaj przepis</button>
                  <div style={filterBar}>
                    {['Wszystkie', ...MEAL_TYPES].map(cat => (
                      <button key={cat} onClick={() => setRecipeListCategory(cat === 'Wszystkie' ? '' : cat)} style={recipeListCategory === (cat === 'Wszystkie' ? '' : cat) ? btnFilterActive : btnFilter}>{cat}</button>
                    ))}
                  </div>
                  {recipes.filter(r => !recipeListCategory || r.category === recipeListCategory).map(r => (
                    <div key={r.id} className="list-card">
                      <div className="list-card-title">{r.is_favorite && '⭐ '}{r.name}</div>
                      <div className="list-card-actions">
                        <span style={{color: '#059669', fontWeight: 'bold'}}>{parseFloat(r.total_cost).toFixed(2)} zł</span>
                        <div style={{display:'flex', gap:'8px'}}>
                          <button onClick={() => handleEditRecipeDirectly(r)} style={{...btnActionSmall, background: '#e2e8f0', color: '#000'}}>✏️</button>
                          <button onClick={() => confirm('Usunąć?') && supabase.from('recipes').delete().eq('id', r.id).then(() => fetchData())} style={{...btnActionSmall, background: '#fee2e2', color: '#ef4444'}}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{paddingBottom:'40px'}}>
                  <button onClick={() => setShowRecipeForm(false)} style={btnSec}>⬅ Wróć</button>
                  <div style={{...formBoxS, background: '#fdf4ff', marginTop:'20px', borderRadius: '32px', borderColor: '#f0abfc'}}>
                    <h4 onClick={() => setShowAiPanel(!showAiPanel)} style={{cursor:'pointer', display: 'flex', justifyContent: 'space-between', margin: 0, color: '#c026d3', fontWeight: '900'}}><span>✨ Magia AI</span> <span>{showAiPanel?'▲':'▼'}</span></h4>
                    {showAiPanel && (
                      <div style={{marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px'}}>
                        <input style={{...inputS, marginBottom:0, borderColor: '#fbcfe8'}} placeholder="Wklej link (URL)" value={aiUrl} onChange={e => setAiUrl(e.target.value)} />
                        <button onClick={handleAiRecipeFromUrl} style={{...btnPrim, background: '#d946ef'}}>{isAiLoading?'Chwileczkę...':'Pobierz przepis'}</button>
                        <div style={{textAlign: 'center', color: '#d946ef', fontWeight: '900', fontSize: '14px'}}>LUB</div>
                        <label style={{...btnPrim, textAlign:'center', background: '#d946ef', cursor: 'pointer', padding: '16px', borderRadius: '24px'}}>
                          📷 Skanuj zdjęcie z galerii
                          <input type="file" accept="image/*" style={{display:'none'}} onChange={handleAiRecipeScan} />
                        </label>
                      </div>
                    )}
                  </div>
                  <div style={{marginTop: '25px'}}>
                    <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px'}}>
                      <input style={{...inputS, marginBottom: 0, flex: 1}} placeholder="Nazwa dania" value={newRecipe.name} onChange={e => setNewRecipe({...newRecipe, name: e.target.value})} />
                      <button onClick={() => setNewRecipe({ ...newRecipe, is_favorite: !newRecipe.is_favorite })} style={{ ...iconBtn, fontSize: '28px', background: 'transparent' }}>{newRecipe.is_favorite ? '⭐' : '☆'}</button>
                    </div>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 130px', gap: '12px', marginBottom: '20px'}}>
                       <select style={{...inputS, marginBottom: 0}} value={newRecipe.category} onChange={e => setNewRecipe({...newRecipe, category: e.target.value})}>{MEAL_TYPES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
                       <div style={{...inputS, display: 'flex', alignItems: 'center', gap: '5px', padding: '0 15px', marginBottom: 0}}><small style={{fontWeight: '900', color: '#64748b'}}>Porcje:</small><input style={{width: '40px', border: 'none', background: 'transparent', fontWeight: '900', fontSize: '18px', textAlign: 'center', outline: 'none'}} type="number" min="1" value={newRecipe.portions} onChange={e => setNewRecipe({...newRecipe, portions: parseInt(e.target.value)||1})} /></div>
                    </div>
                    <label style={{display: 'block', padding: '20px', background: '#f1f5f9', border: '3px dashed #cbd5e1', borderRadius: '28px', textAlign: 'center', cursor: 'pointer', color: '#475569', fontWeight: '900', fontSize: '15px', marginBottom: '20px'}}>
                      {newRecipe.image_url ? '✅ Zdjęcie wybrane' : '📷 Wybierz zdjęcie'}
                      <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                    <textarea style={{...inputS, minHeight: '120px'}} placeholder="Krótki opis / uwagi..." value={newRecipe.instructions} onChange={e => setNewRecipe({...newRecipe, instructions: e.target.value})} />
                    
                    <h4 style={{marginTop: '25px', marginBottom: '15px', color: '#0f172a', fontWeight: '900', fontSize: '20px'}}>Składniki</h4>
                    <div ref={searchContainerRef} style={{position: 'relative', marginBottom: '15px'}}>
                       <input style={{...inputS, borderColor: showSearchDropdown ? '#059669' : '#e2e8f0'}} placeholder="🔍 Szukaj składnika..." value={searchQuery} onChange={e => {setSearchQuery(e.target.value); setShowSearchDropdown(true);}} onFocus={() => setShowSearchDropdown(true)}/>
                       {showSearchDropdown && (
                         <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, maxHeight: '250px', overflowY: 'auto', background: 'white', borderRadius: '24px', boxShadow: '0 15px 35px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', padding: '15px' }}>
                            {products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(p => (
                              <div key={p.id} style={{padding: '15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontWeight: '800', display: 'flex', justifyContent: 'space-between'}} onClick={() => { setNewRecipe({ ...newRecipe, ingredients: [...newRecipe.ingredients, { ...p, amount: 100 }] }); setSearchQuery(''); setShowSearchDropdown(false); }}>
                                <span>{p.name}</span> <span style={{color: '#94a3b8', fontWeight: 'bold'}}>{p.unit}</span>
                              </div>
                            ))}
                         </div>
                       )}
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '30px'}}>
                      {newRecipe.ingredients.map((ing, idx) => (
                        <div key={idx} style={{background: '#f8fafc', padding: '18px', borderRadius: '24px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px'}}>
                          <b style={{flex: 1, fontSize: '15px'}}>{ing.name}</b>
                          <input type="number" style={{...inputS, width: '80px', marginBottom: 0, padding: '12px', textAlign: 'center'}} value={ing.amount} onChange={e => { const c = [...newRecipe.ingredients]; c[idx].amount = e.target.value; setNewRecipe({...newRecipe, ingredients: c}); }} />
                          <button onClick={() => setNewRecipe({...newRecipe, ingredients: newRecipe.ingredients.filter((_, i) => i !== idx)})} style={{...iconBtn, color: '#ef4444', background: '#fee2e2'}}>✕</button>
                        </div>
                      ))}
                    </div>

                    <h4 style={{marginTop: '10px', color: '#0f172a', fontWeight: '900', fontSize: '20px'}}>Kroki gotowania</h4>
                    {newRecipe.steps.map((s, i) => (
                      <div key={i} style={{display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '15px'}}>
                        <div style={{...stepCircleS, background: '#e2e8f0', color: '#475569', marginTop: '5px'}}>{i + 1}</div>
                        <textarea style={{...inputS, marginBottom: 0, minHeight: '80px', flex: 1}} value={s} onChange={e => { const c = [...newRecipe.steps]; c[i] = e.target.value; setNewRecipe({...newRecipe, steps: c}); }} />
                        <button onClick={() => setNewRecipe({...newRecipe, steps: newRecipe.steps.filter((_, idx) => idx !== i)})} style={{...iconBtn, color: '#ef4444', background: '#fee2e2', marginTop: '5px'}}>✕</button>
                      </div>
                    ))}
                    <button style={{...btnSec, width: '100%', padding: '16px', borderRadius: '24px'}} onClick={() => setNewRecipe({...newRecipe, steps: [...newRecipe.steps, '']})}>+ Dodaj kolejny krok</button>
                    <button style={{...btnSuccessFull, marginTop: '40px', padding: '22px', fontSize: '18px'}} onClick={handleSaveRecipe}>ZAPISZ PRZEPIS</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STATYSTYKI */}
      {activeModal === 'stats' && (
        <div className="sheet-container" onClick={() => setActiveModal(null)}>
          <div className="sheet-card" onClick={e => e.stopPropagation()}>
            <div className="drag-handle"></div>
            <div className="sheet-header">
              <h2 style={{margin:0, fontSize: '22px'}}>📈 Statystyki</h2>
              <button onClick={() => setActiveModal(null)} style={iconBtn}>✕</button>
            </div>
            <div className="sheet-content hide-scrollbar">
              <div style={filterBar}>
                <button style={statTab === 'summary' ? statTabActive : statTabBtn} onClick={() => setStatTab('summary')}>📊 Podsumowanie</button>
                <button style={statTab === 'expenses' ? statTabActive : statTabBtn} onClick={() => setStatTab('expenses')}>💸 Wydatki</button>
                <button style={statTab === 'products' ? statTabActive : statTabBtn} onClick={() => setStatTab('products')}>🛒 Składniki</button>
              </div>
              <div style={{marginTop:'25px'}}>
                {statTab === 'summary' && (
                  <div style={{...statBoxS, background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color:'#fff', borderRadius: '35px', textAlign: 'center'}}>
                    <h3 style={{margin: 0, opacity: 0.9}}>Wydano w tym miesiącu</h3>
                    <div style={{fontSize:'54px', fontWeight:900, margin: '15px 0'}}>{advancedStats.currentMonthCost} zł</div>
                    <p style={{fontWeight: 'bold', background: 'rgba(255,255,255,0.2)', padding: '10px 20px', borderRadius: '20px', display: 'inline-block'}}>Średnio dziennie: {advancedStats.avgDailyCost} zł</p>
                  </div>
                )}
                {statTab === 'expenses' && advancedStats.mealTypeCosts.map(([type, cost]) => (
                  <div key={type} className="list-card">
                    <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: '900'}}><span>{type}</span><span>{cost.toFixed(2)} zł</span></div>
                    <div style={{height:'12px', background:'#e2e8f0', borderRadius:'10px', overflow:'hidden'}}><div style={{width: `${(cost/advancedStats.maxMealType)*100}%`, height:'100%', background:'#059669'}}></div></div>
                  </div>
                ))}
                {statTab === 'products' && advancedStats.topByCost.map(([name, data]) => (
                  <div key={name} className="list-card">
                    <div className="list-card-title">{name}</div>
                    <b style={{color: '#e11d48', alignSelf: 'flex-start', background: '#ffe4e6', padding: '6px 15px', borderRadius: '15px'}}>{data.totalCost.toFixed(2)} zł</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DODAJ DO LISTY */}
      {activeModal === 'add-to-cart' && (
        <div className="sheet-container" onClick={() => setActiveModal(null)}>
          <div className="sheet-card" style={{ height: 'auto', paddingBottom: '30px', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="drag-handle"></div>
            <div className="sheet-header">
              <h2 style={{margin:0, fontSize: '22px'}}>🛒 Dodaj do listy</h2>
              <button onClick={() => setActiveModal(null)} style={iconBtn}>✕</button>
            </div>
            <div className="sheet-content hide-scrollbar">
              <div style={filterBar}>
                <button style={cartModalTab === 'recipes' ? statTabActive : statTabBtn} onClick={() => setCartModalTab('recipes')}>Z przepisów</button>
                <button style={cartModalTab === 'products' ? statTabActive : statTabBtn} onClick={() => setCartModalTab('products')}>Pojedyncze produkty</button>
              </div>
              <div style={{marginTop:'15px', display: 'flex', flexDirection: 'column'}}>
                {cartModalTab === 'recipes' ? recipes.map(r => (
                  <div key={r.id} className="compact-list-row" onClick={() => { setManualCart(p => [...p, ...r.recipe_ingredients.map(ri => ({ ...ri.products, amount: ri.amount, pricePU: ri.products.price_per_unit }))]); setActiveModal(null); }}>
                    <div style={{fontWeight: '800', fontSize: '15px', color: '#0f172a', flex: 1}}>{r.name}</div>
                    <button style={{...btnCartAddSmall, background: '#059669', color: '#fff'}}>+ Przepis</button>
                  </div>
                )) : products.map(p => (
                  <div key={p.id} className="compact-list-row" onClick={() => { setManualCart(p_prev => [...p_prev, { ...p, amount: p.last_input_quantity || 100, pricePU: p.price_per_unit }]); setActiveModal(null); }}>
                    <div style={{fontWeight: '800', fontSize: '15px', color: '#0f172a', flex: 1}}>{p.name}</div>
                    <button style={{...btnCartAddSmall, background: '#3b82f6', color: '#fff'}}>+ Dodaj</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- WIDOK PRZEPISU EDGE-TO-EDGE --- */}
      {activeModal === 'view-recipe' && viewingRecipe && (
        <div style={immersiveOverlayS} onClick={() => setActiveModal(null)}>
          <div style={immersiveCardS} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...heroImageS, backgroundImage: viewingRecipe.image_url ? `url(${viewingRecipe.image_url})` : sharedGradient }}>
              <button onClick={() => setActiveModal(null)} style={floatingCloseBtnS}>✕</button>
            </div>
            <div className="hide-scrollbar" style={immersiveContentS}>
              <div style={dragHandleS}></div>
              <h2 style={{ fontSize: '32px', margin: '0 0 15px 0', fontWeight: '900', lineHeight: '1.2' }}>{viewingRecipe.name}</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <span style={{ fontSize: '24px', fontWeight: '900', color: '#059669' }}>{parseFloat(viewingRecipe.total_cost || 0).toFixed(2)} zł</span>
                <span style={{ color: '#475569', fontSize: '14px', fontWeight: '900', background: '#f1f5f9', padding: '8px 16px', borderRadius: '16px' }}>Porcje: {viewingRecipe.portions || 1}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', background: '#f8fafc', padding: '6px', borderRadius: '24px' }}>
                <button style={viewMode === 'desc' ? tabActiveS : tabInactiveS} onClick={() => setViewMode('desc')}>Opis</button>
                <button style={viewMode === 'steps' ? tabActiveS : tabInactiveS} onClick={() => setViewMode('steps')}>Kroki ({viewingRecipe.steps?.length || 0})</button>
              </div>
              <div style={{ paddingBottom: '140px' }}>
                {viewMode === 'desc' ? (
                  <>
                    <h4 style={{ margin: '0 0 15px 0', fontWeight: '900' }}>🛒 Składniki</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {viewingRecipe.recipe_ingredients?.map((ri, idx) => (
                        <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 20px', borderRadius: '20px', fontSize: '15px', fontWeight: '700' }}>
                          <b style={{color: '#0f172a'}}>{ri.products?.name}</b> <span style={{color: '#cbd5e1', margin: '0 5px'}}>|</span> {ri.amount} {ri.products?.unit}
                        </div>
                      ))}
                    </div>
                    <p style={{ marginTop:'30px', whiteSpace: 'pre-wrap', color: '#475569', fontSize: '17px', lineHeight: '1.8', fontWeight: '600' }}>{viewingRecipe.instructions}</p>
                  </>
                ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                    {viewingRecipe.steps?.map((s, i) => (
                      <div key={i} style={stepItemS}>
                        <div style={stepCircleS}>{i + 1}</div>
                        <div style={{ flex: 1, fontSize: '16px', lineHeight: '1.6', fontWeight: '600', color: '#1e293b' }}>{renderStepWithIngredients(s, viewingRecipe.recipe_ingredients)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={fabContainerS}><button style={fabButtonS} onClick={() => { setCookingStep(0); setIsVoiceActive(false); setIsTtsActive(false); setActiveModal('cooking-mode'); }}>👨‍🍳 ROZPOCZNIJ GOTOWANIE</button></div>
          </div>
        </div>
      )}

      {/* TRYB GOTOWANIA */}
      {activeModal === 'cooking-mode' && viewingRecipe && (
        <div style={cookingOverlayS}>
          <div style={cookingCardS}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px'}}>
              <button onClick={() => setActiveModal('view-recipe')} style={{...btnSec, borderRadius: '25px'}}>⬅ Powrót</button>
              <div style={{display:'flex', gap:'10px'}}>
                <button onClick={() => setIsTtsActive(!isTtsActive)} style={{...btnSec, borderRadius: '25px', background: isTtsActive ? '#e0e7ff' : '#f1f5f9', color: isTtsActive ? '#4f46e5' : '#475569'}}>{isTtsActive?'🔊 ON':'🔈 OFF'}</button>
                <button onClick={toggleVoiceMode} style={{...btnSec, borderRadius: '25px', background: isVoiceActive ? '#fee2e2' : '#f1f5f9', color: isVoiceActive ? '#ef4444' : '#475569'}}>{isVoiceActive?'🔴 SŁUCHAM':'🎙️ MIKROFON'}</button>
              </div>
            </div>
            <div style={{textAlign:'center', fontSize:'34px', fontWeight:700, flex:1, display:'flex', alignItems:'center', justifyContent:'center', lineHeight: '1.4', padding: '0 10px'}}>
              {renderStepWithIngredients(viewingRecipe.steps[cookingStep], viewingRecipe.recipe_ingredients)}
            </div>
            <div style={{display:'flex', gap:'20px', marginTop:'20px'}}>
              <button style={{...btnSuccessFull, background:'#f1f5f9', color:'#000'}} onClick={() => setCookingStep(p => Math.max(0, p-1))} disabled={cookingStep===0}>Wstecz</button>
              <button style={btnSuccessFull} onClick={() => cookingStep === viewingRecipe.steps.length-1 ? setActiveModal('view-recipe') : setCookingStep(p => p+1)}>
                {cookingStep === viewingRecipe.steps.length-1 ? 'ZAKOŃCZ 🎉' : 'Następny ➡'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- LOGIN VIEW ---
function LoginView() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const handleLogin = async (e) => { e.preventDefault(); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) alert(error.message); };
  return (
    <div style={loginOverlay}>
      <form onSubmit={handleLogin} style={loginForm}>
        <h2 style={{ color: '#059669', textAlign: 'center', marginBottom: '30px', fontSize: '28px', fontWeight: '900' }}>Jedzonko Planer</h2>
        <input style={inputS} type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} />
        <input style={inputS} type="password" placeholder="Hasło" onChange={e => setPassword(e.target.value)} />
        <button style={btnSuccessFull}>Zaloguj</button>
      </form>
    </div>
  );
}

// --- STYLE ---
const appContainer = { padding: '15px', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'white', padding: '20px', borderRadius: '35px', boxShadow: '0 4px 25px rgba(0,0,0,0.03)' };
const headerMobile = { ...headerStyle, flexDirection: 'column', gap: '15px' };
const logoTitleS = { margin: 0, color: '#059669', fontSize: '22px', fontWeight: '900' };
const logoCircleS = { width: '50px', height: '50px', backgroundColor: '#ecfdf5', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #059669', fontSize: '26px' };
const navButtons = { display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' };
const btnTodayActive = { background: '#059669', color: 'white', border: 'none', padding: '12px 22px', borderRadius: '25px', fontWeight: '900', fontSize: '13px' };
const btnSec = { background: '#f1f5f9', color: '#475569', border: 'none', padding: '12px 22px', borderRadius: '25px', cursor: 'pointer', fontWeight: '900', fontSize: '13px' };
const btnPrim = { background: '#059669', color: 'white', border: 'none', padding: '12px 22px', borderRadius: '25px', fontWeight: '900', cursor: 'pointer', fontSize: '13px' };
const btnPrimSmall = { ...btnPrim, padding: '10px 18px', fontSize: '12px' };
const btnStats = { background: '#3b82f6', color: 'white', border: 'none', padding: '12px 22px', borderRadius: '25px', fontWeight: '900', fontSize: '13px' };
const btnDanger = { background: '#fef2f2', color: '#ef4444', border: 'none', padding: '12px 22px', borderRadius: '25px', fontWeight: '900', fontSize: '13px' };
const gridStyle = { display: 'grid', gridTemplateColumns: '120px repeat(6, 1fr)', gap: '15px' };
const layoutGrid = { display: 'grid', gridTemplateColumns: '1fr', gap: '20px' };
const mobileStack = { display: 'flex', flexDirection: 'column', gap: '15px' };
const dayCell = { background: 'white', padding: '25px 10px', borderRadius: '35px', textAlign: 'center', borderLeft: '8px solid #059669', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' };
const mobileDayLabel = { background: '#0f172a', color: 'white', padding: '20px', borderRadius: '35px', fontWeight: '900', textAlign: 'center', fontSize: '16px' };
const mealHeader = { textAlign: 'center', fontWeight: '900', color: '#94a3b8', fontSize: '13px' };
const cellStyleEmpty = { minHeight: '130px', background: '#f8fafc', borderRadius: '35px', border: '3px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', overflow: 'hidden' };
const cellStyleActive = { ...cellStyleEmpty, border: 'none', boxShadow: '0 15px 30px -10px rgba(0,0,0,0.08)' };
const emptyCellPlus = { width: '45px', height: '45px', borderRadius: '50%', background: '#e2e8f0', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '26px' };
const mealContent = { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '20px 10px 24px 10px' };
const mealNameS = { fontWeight: '900', fontSize: '14px', textAlign: 'center', textShadow: '0 2px 8px rgba(0,0,0,0.8)', lineHeight: '1.4' };
const daySumCell = { background: '#f0fdf4', padding: '25px', borderRadius: '35px', textAlign: 'center', border: '2px dashed #059669' };
const mobileSumLabel = { background: '#059669', color: 'white', padding: '20px', borderRadius: '35px', fontWeight: '900', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const weekSummaryPanel = { margin: '35px 0', background: 'white', padding: '35px', borderRadius: '45px', border: '4px solid #059669', boxShadow: '0 25px 50px -15px rgba(5,150,105,0.15)' };
const btnActionSmall = { border: 'none', borderRadius: '16px', width: '38px', height: '38px', cursor: 'pointer', background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)', color:'#fff', fontSize: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' };
const mobileMealTag = { position: 'absolute', top: '15px', left: '15px', fontSize: '11px', fontWeight: '900', opacity: 0.9 };
const shoppingPanel = { marginTop: '35px', background: 'white', padding: '35px', borderRadius: '45px', boxShadow: '0 10px 40px rgba(0,0,0,0.04)' };
const shoppingGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' };
const shoppingItem = { padding: '22px', borderRadius: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #f1f5f9' };
const inputS = { width: '100%', padding: '18px 25px', marginBottom: '18px', borderRadius: '28px', border: '2px solid #e2e8f0', fontSize: '16px', background:'#f8fafc', fontWeight: '700', outline: 'none', boxSizing: 'border-box' };
const btnSuccessFull = { background: '#059669', color: 'white', border: 'none', padding: '20px', borderRadius: '32px', width: '100%', fontWeight: '900', cursor: 'pointer', fontSize:'17px', boxShadow: '0 12px 25px rgba(5,150,105,0.25)' };
const btnFilter = { background: '#f1f5f9', color: '#64748b', border: 'none', padding: '14px 28px', borderRadius: '25px', fontWeight: '900', fontSize: '13px' };
const btnFilterActive = { ...btnFilter, background: '#059669', color: 'white', boxShadow: '0 6px 15px rgba(5,150,105,0.25)' };
const filterBar = { display: 'flex', gap: '12px', marginBottom: '25px', overflowX: 'auto', paddingBottom: '10px' };
const iconBtn = { border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' };
const loginOverlay = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f3f4f6' };
const loginForm = { background: 'white', padding: '55px 45px', borderRadius: '45px', width: '90%', maxWidth: '440px', boxShadow: '0 30px 60px -15px rgba(0,0,0,0.12)' };
const loadingStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#059669', fontSize: '22px', fontWeight: '900' };
const formBoxS = { background: '#f8fafc', padding: '30px', borderRadius: '35px', border: '2px solid #e2e8f0' };
const stepItemS = { padding: '22px', background: '#f8fafc', borderRadius: '28px', marginBottom: '15px', display: 'flex', gap: '18px', alignItems: 'center' };
const stepCircleS = { width: '40px', height: '40px', background: '#059669', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', flexShrink: 0 };
const btnCartAddSmall = { background: '#e0fdf4', color: '#059669', border: 'none', padding: '12px 20px', borderRadius: '18px', fontWeight: '900', fontSize: '13px' };
const statBoxS = { padding: '35px', borderRadius: '40px', marginBottom: '25px' };
const statRowS = { display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px' };
const statTabBtn = { background: 'transparent', color: '#94a3b8', border: 'none', padding: '14px 28px', fontSize: '15px', fontWeight: '900', borderRadius: '22px' };
const statTabActive = { ...statTabBtn, background: '#ecfdf5', color: '#059669' };
const immersiveOverlayS = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1200, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', animation: 'fadeInOverlay 0.3s forwards' };
const immersiveCardS = { width: '100%', maxWidth: '800px', height: '95vh', background: '#fff', borderTopLeftRadius: '45px', borderTopRightRadius: '45px', display: 'flex', flexDirection: 'column', animation: 'slideUpImmersive 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards', overflow: 'hidden' };
const heroImageS = { height: '38%', width: '100%', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' };
const floatingCloseBtnS = { position: 'absolute', top: '25px', right: '25px', width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(15,23,42,0.6)', color: '#fff', border:'none', backdropFilter:'blur(10px)', fontWeight: '900', cursor: 'pointer' };
const immersiveContentS = { flex: 1, padding: '40px', overflowY: 'auto', marginTop:'-40px', background:'#fff', borderTopLeftRadius:'45px', borderTopRightRadius:'45px' };
const dragHandleS = { width: '55px', height: '7px', background: '#cbd5e1', borderRadius: '10px', margin: '0 auto 30px auto' };
const tabInactiveS = { flex: 1, padding: '16px', background: 'transparent', border: 'none', color: '#94a3b8', fontWeight: '900', fontSize: '15px', borderRadius: '20px' };
const tabActiveS = { ...tabInactiveS, background: '#fff', color: '#059669', boxShadow: '0 6px 15px rgba(0,0,0,0.06)' };
const fabContainerS = { position: 'absolute', bottom: '35px', left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' };
const fabButtonS = { background: '#059669', color: '#fff', border: 'none', padding: '22px 50px', borderRadius: '60px', fontWeight: '900', fontSize: '17px', boxShadow: '0 18px 35px rgba(5,150,105,0.4)', pointerEvents: 'auto', cursor: 'pointer' };
const cookingOverlayS = { ...immersiveOverlayS, background: 'rgba(15,23,42,0.98)' };
const cookingCardS = { ...immersiveCardS, height:'92vh', padding:'45px', borderRadius: '45px 45px 0 0' };