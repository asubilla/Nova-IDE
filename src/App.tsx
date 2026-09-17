import { ErrorBoundary } from './components/ErrorBoundary';
import { MainLayout } from './components/layout/MainLayout';
import { NotificationContainer } from './components/notifications/NotificationContainer';
import './styles/reset.css';
import './styles/variables.css';
import './styles/typography.css';
import './styles/utilities.css';
import './styles/layout.css';
import './styles/notifications.css';

function App() {
  return (
    <ErrorBoundary>
      <MainLayout />
      <NotificationContainer />
    </ErrorBoundary>
  );
}

export default App;
