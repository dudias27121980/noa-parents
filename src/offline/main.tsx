import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import { SharedStore } from '../sync/store';
import { STORAGE_KEY, openBrowserDb } from './browserDb';
import { createLocalServer } from './localServer';
import { BackupButtons } from './BackupButtons';
import '../index.css';

// The offline file: the whole system in one page, with the data kept in this browser only
let warned = false;
const db = openBrowserDb(window.localStorage, () => {
  if (warned) return;
  warned = true;
  window.alert('השמירה בדפדפן נכשלה (האחסון מלא או חסום). השינויים לא יישמרו - יש לייצא גיבוי עכשיו.');
});
const server = createLocalServer(db);
const store = new SharedStore(server.transport);
store.start();

const restore: Parameters<typeof BackupButtons>[0]['restore'] = (dump) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dump));
  } catch {
    window.alert('השחזור נכשל: לא ניתן לשמור בדפדפן');
    return;
  }
  window.location.reload();
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} headerActions={<BackupButtons dump={db.dump} restore={restore} />} />
  </StrictMode>
);
