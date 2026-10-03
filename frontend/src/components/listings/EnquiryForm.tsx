import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, isMock } from '../../api/client';
import type { Listing } from '../../api/types';
import { useSite } from '../../auth/AuthProvider';

export function EnquiryForm({ listing: l, monthly }: { listing: Listing; monthly: number }) {
  const isSupply = l.kind === 'supply';
  const site = useSite();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [tonnes, setTonnes] = useState(Math.min(Math.round(monthly), 30));
  const [first, setFirst] = useState('November 2026');
  const [message, setMessage] = useState(
    isSupply ? `We need assay certificates with each load, delivered to ${site.suburb} ${site.state}.` : `We can supply from ${site.suburb} ${site.state} with assay certificates.`,
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      await api.sendEnquiry(l.id, { tonnesPerMonth: tonnes, firstDelivery: first, message });
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  const title = isSupply ? 'Request a quote' : 'Make an offer';
  if (status === 'sent') {
    return (
      <section className="panel" id="enquiry">
        <h2>{title}</h2>
        <div className="notice" role="status">
          <CheckCircle2 size={16} />
          <div><b>Request sent to {l.company}.</b><br />{isMock ? 'Demo mode: nothing left this browser.' : 'Replies appear in your inbox.'}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel" id="enquiry">
      <h2>{title}</h2>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <label className="field">Tonnes per month
            <input id="enq-tonnes" type="number" min={1} value={tonnes} onChange={e => setTonnes(Number(e.target.value))} required />
          </label>
          <label className="field">First delivery
            <select id="enq-first" value={first} onChange={e => setFirst(e.target.value)}>
              <option>November 2026</option><option>December 2026</option><option>January 2027</option>
            </select>
          </label>
        </div>
        <label className="field">Note to {isSupply ? 'supplier' : 'buyer'}
          <textarea id="enq-message" value={message} onChange={e => setMessage(e.target.value)} />
        </label>
        {status === 'error' && <div className="notice error" role="alert"><AlertTriangle size={16} />Couldn't send the request. Check your connection and try again.</div>}
        <button className="btn btn-primary" type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : isSupply ? 'Send quote request' : 'Send offer'}
        </button>
      </form>
    </section>
  );
}
