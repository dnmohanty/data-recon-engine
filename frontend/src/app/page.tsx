'use client';

import { useState, useEffect } from 'react';

export default function Dashboard() {
  const [events, setEvents] = useState<any[]>([]);
  const [businessKey, setBusinessKey] = useState('acme-corp');
  const [name, setName] = useState('Acme Corporation');

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:3000/stream');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEvents((prev) => [data, ...prev].slice(0, 15));
    };

    return () => eventSource.close();
  }, []);

  const triggerEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const eventId = `manual_evt_${Date.now()}`;
    
    await fetch('http://localhost:3000/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, businessKey, data: { name } })
    });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="border-b border-gray-800 pb-4">
          <h1 className="text-3xl font-bold text-emerald-400">Data Recon Engine</h1>
          <p className="text-gray-400">Real-time Entity Resolution & Deduplication</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Simulate Incoming Data</h2>
            <form onSubmit={triggerEvent} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Business Key</label>
                <input 
                  value={businessKey} onChange={(e) => setBusinessKey(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Messy Name Variant</label>
                <input 
                  value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded transition-colors">
                Fire Event 🚀
                <button 
  onClick={() => fetch('https://YOUR-RENDER-API-URL.onrender.com/demo')}
  className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
>
  Run 150-Event Demo 🧪
</button>
              </button>
            </form>
          </div>

          <div className="bg-black p-6 rounded-lg border border-gray-800 shadow-lg font-mono flex flex-col">
            <h2 className="text-xl font-semibold mb-4 text-white font-sans">Live Consensus Stream</h2>
            <div className="flex-1 overflow-y-auto space-y-2 max-h-64">
              {events.length === 0 ? (
                <p className="text-gray-600 italic">Waiting for events via SSE...</p>
              ) : (
                events.map((evt, i) => (
                  <div key={i} className="text-sm bg-gray-900 p-2 rounded border-l-2 border-emerald-500">
                    <span className="text-emerald-400">[{evt.state}]</span>{' '}
                    <span className="text-gray-300">ID: {evt.id.split('-')[0]}...</span>{' '}
                    <span className="text-blue-400">Rep: {Number(evt.reputation).toFixed(1)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}