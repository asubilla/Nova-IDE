import { ErrorBoundary } from './components/ErrorBoundary';
import { MainLayout } from './components/layout/MainLayout';
import './styles/reset.css';
import './styles/variables.css';
import './styles/typography.css';
import './styles/utilities.css';
import './styles/layout.css';

function App() {
  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  );
}

export default App;
