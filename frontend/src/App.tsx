import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { TopBar } from './components/layout/TopBar';
import { Home } from './pages/Home';
import { Login, Signup } from './pages/Auth';
import { Marketplace } from './pages/Marketplace';
import { Matches } from './pages/Matches';
import { MyListings } from './pages/MyListings';
import { SellNew } from './pages/SellNew';
import { Impact } from './pages/Impact';
import { ListingDetail } from './pages/ListingDetail';

/** Signed-in shell: top bar plus the current page. */
function AppShell() {
  return (
    <RequireAuth>
      <div className="app">
        <TopBar />
        <div className="app-main"><Outlet /></div>
      </div>
    </RequireAuth>
  );
}

/** Keeps old /matches links working. */
function MatchesRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/sourcing${search}`} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route element={<AppShell />}>
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/listing/:id" element={<ListingDetail />} />
            <Route path="/impact" element={<Impact />} />
            <Route path="/sourcing" element={<RequireAuth role="buyer"><Matches /></RequireAuth>} />
            <Route path="/matches" element={<MatchesRedirect />} />
            <Route path="/my-listings" element={<RequireAuth role="seller"><MyListings /></RequireAuth>} />
            <Route path="/sell/new" element={<RequireAuth role="seller"><SellNew /></RequireAuth>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
