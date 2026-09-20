import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';

const Context = createContext(null);
export function NotificationProvider({children}) {
  const [items,setItems] = useState([]), [open,setOpen] = useState(false);
  const sequence = useRef(0);
  const notify = useCallback((message, type='info') => {
    if (!message) return;
    setItems(old => [{id:++sequence.current,message:String(message),type,time:new Date().toLocaleTimeString(),visible:true},...old].slice(0,50));
  },[]);
  const dismiss = id => setItems(old => old.map(item => item.id === id ? {...item,visible:false} : item));
  return <Context.Provider value={notify}>{children}
    <button className="notification-history btn btn-secondary" onClick={() => setOpen(!open)} aria-expanded={open}>Notifications ({items.length})</button>
    {open && <aside className="notification-drawer" aria-label="Notification history"><h3>Recent events</h3>
      {!items.length && <p>No events yet.</p>}{items.map(item => <p key={item.id}><small>{item.time}</small> {item.message}</p>)}</aside>}
    <div className="toast-stack" aria-label="Notifications">{items.filter(item => item.visible).slice(0,3).map(item => <Toast key={item.id} item={item} dismiss={dismiss}/>)}</div>
  </Context.Provider>;
}
function Toast({item,dismiss}) {
  useEffect(() => {
    if (item.type === 'error') return;
    const timer=setTimeout(() => dismiss(item.id),8000); return () => clearTimeout(timer);
  },[item.id]);
  return <div className={`toast toast-${item.type}`} role={item.type === 'error' ? 'alert' : 'status'}>
    <div><small>{item.time}</small><p>{item.message}</p></div><button aria-label="Dismiss notification" onClick={() => dismiss(item.id)}>×</button>
  </div>;
}
export const useNotify = () => useContext(Context);
export function useNotice(message, type='error') {
  const notify=useNotify(), previous=useRef(null);
  useEffect(() => {if (message && message !== previous.current) notify(message,type); previous.current=message;},[message,type,notify]);
}
