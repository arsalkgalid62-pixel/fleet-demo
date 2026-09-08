import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Passenger from './pages/Passenger.jsx';
import Dispatch from './pages/Dispatch.jsx';
import Driver from './pages/Driver.jsx';
import SeatShell from './components/SeatShell.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/passenger"
        element={
          <SeatShell seat="passenger" title="Book a car" accounts={['passenger']}>
            <Passenger />
          </SeatShell>
        }
      />
      <Route
        path="/dispatch"
        element={
          <SeatShell seat="dispatch" title="Dispatch operations" accounts={['dispatch']}>
            <Dispatch />
          </SeatShell>
        }
      />
      <Route
        path="/driver"
        element={
          <SeatShell
            seat="driver"
            title="Driver"
            accounts={['drv-ashton', 'drv-baker', 'drv-choudhury', 'drv-doyle', 'drv-ellis']}
          >
            <Driver />
          </SeatShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
