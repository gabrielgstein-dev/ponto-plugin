import ReactDOM from 'react-dom/client';
import { SidePanelApp } from '../../lib/presentation/SidePanelApp';
import { installErrorHandlers } from '../../lib/domain/install-error-handlers';
import './style.css';

installErrorHandlers();
ReactDOM.createRoot(document.getElementById('root')!).render(<SidePanelApp />);
