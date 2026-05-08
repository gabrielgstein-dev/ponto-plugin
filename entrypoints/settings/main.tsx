import ReactDOM from 'react-dom/client';
import { SettingsSidePanelApp } from '../../lib/presentation/SettingsSidePanelApp';
import { installErrorHandlers } from '../../lib/domain/install-error-handlers';
import './style.css';

installErrorHandlers();
ReactDOM.createRoot(document.getElementById('root')!).render(<SettingsSidePanelApp />);
