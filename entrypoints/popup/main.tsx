import ReactDOM from 'react-dom/client';
import { App } from '../../lib/presentation/App';
import { installErrorHandlers } from '../../lib/domain/install-error-handlers';
import './style.css';

installErrorHandlers();
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
