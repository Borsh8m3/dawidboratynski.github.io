import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const MEALS = [
  { name: "Śniadanie", icon: "🍳", color: "#FFF9C4" },
  { name: "Lunch", icon: "🥗", color: "#E8F5E9" },
  { name: "Obiad", icon: "🍲", color: "#FFECB3" },
  { name: "Przekąska", icon: "🍎", color: "#F3E5F5" },
  { name: "Kolacja", icon: "🌙", color: "#E3F2FD" }
];

export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [weekDates, setWeekDates] = useState([]);

  // 1. Logika sprawdzania zalogowania
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    generateWeekDates();
    return () => subscription.unsubscribe();
  }, []);

  // 2. Funkcja generująca daty bieżącego tygodnia
  const generateWeekDates = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 (Nd) do 6 (So)
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Ustawienie na Poniedziałek
    
    const dates = [];
    const daysNames = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.setDate(diff + i));
      dates.push({
        name: daysNames[i],
        date: d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
      });
    }
    setWeekDates(dates);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Błąd: " + error.message);
  };

  // --- WIDOK LOGOWANIA ---
  if (!session) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f1f5f9' }}>
        <form onSubmit={handleLogin} style={{ background: 'white', padding: '40px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '320px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>🔐 Logowanie</h2>
          <input type="email" placeholder="Email" style={loginInput} onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Hasło" style={loginInput} onChange={e => setPassword(e.target.value)} />
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Zaloguj się</button>
        </form>
      </div>
    );
  }

  // --- GŁÓWNY WIDOK PLANERA ---
  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0 }}>📅 Plan Tygodniowy</h1>
          <p style={{ color: '#64748b', margin: '5px 0' }}>Tydzień: {weekDates[0]?.date} - {weekDates[6]?.date}</p>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer' }}>Wyloguj</button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(5, 1fr)', gap: '12px', minWidth: '1000px' }}>
        <div />
        {MEALS.map(m => (
          <div key={m.name} style={{ textAlign: 'center', fontWeight: 'bold', color: '#475569' }}>
            {m.icon} {m.name}
          </div>
        ))}

        {weekDates.map(day => (
          <>
            <div style={{ background: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: '5px solid #10b981' }}>
              <div style={{ fontWeight: 'bold' }}>{day.name}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>{day.date}</div>
            </div>
            {MEALS.map(meal => (
              <div 
                key={`${day.name}-${meal.name}`} 
                style={{ backgroundColor: meal.color, height: '110px', borderRadius: '15px', border: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '20px', color: '#94a3b8' }}
              >
                +
              </div>
            ))}
          </>
        ))}
      </div>
    </div>
  );
}

const loginInput = {
  width: '100%',
  padding: '12px',
  marginBottom: '15px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  boxSizing: 'border-box'
};