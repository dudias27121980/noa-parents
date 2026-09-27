import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SharedStore } from './sync/store';
import { STORAGE_KEY, openBrowserDb } from './engine/browserDb';
import { createLocalServer } from './engine/localServer';
import { BackupButtons } from './components/BackupButtons';
import { SaveStatus } from './components/SaveStatus';
import { AutoSaver, browserPickers, indexedDbHandleStore, requestPersistentStorage } from './engine/autoSave';
import './index.css';

// The offline file: the whole system in one page, with the data kept in this browser only
let warned = false;
// Declared first: the engine writes its seed data while it starts, before the saver exists
let saver: AutoSaver | undefined;
const db = openBrowserDb(
  window.localStorage,
  () => {
    if (warned) return;
    warned = true;
    window.alert('השמירה בדפדפן נכשלה (האחסון מלא או חסום). השינויים לא יישמרו - יש לייצא גיבוי עכשיו.');
  },
  () => saver?.schedule()
);
// Every change is also written to a file the HQ chose on disk, which survives a browser clean-up
saver = new AutoSaver(db.dump, indexedDbHandleStore(), browserPickers(), {
  localIsFresh: db.startedEmpty,
  restore: (dump) => restore(dump),
  confirm: (text) => window.confirm(text),
});
const fileSaver = saver;
requestPersistentStorage();
void fileSaver.resume();
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
    <App
      store={store}
      headerActions={
        <>
          <SaveStatus saver={fileSaver} current={db.dump} restore={restore} />
          <BackupButtons dump={db.dump} restore={restore} />
        </>
      }
    />
  </StrictMode>
);
