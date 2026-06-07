import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Traces from './pages/Traces';
import TraceDetail from './pages/TraceDetail';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/traces" element={<Traces />} />
          <Route path="/traces/:traceId" element={<TraceDetail />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
