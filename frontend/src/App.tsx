import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { TopBar } from './components/layout/TopBar';
import { Marketplace } from './pages/Marketplace';
import { Matches } from './pages/Matches';
import { SellNew } from './pages/SellNew';
import { Impact } from './pages/Impact';

export function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <TopBar />
        <div className="app-main">
          <Routes>
            <Route path="/" element={<Marketplace />} />
            <Route path="/listing/:id" element={<Marketplace />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/sell/new" element={<SellNew />} />
            <Route path="/impact" element={<Impact />} />
            <Route path="*" element={<Marketplace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
