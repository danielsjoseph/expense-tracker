import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, CURRENCIES } from '../lib/constants';

function toggleFullscreen(el) {
  const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
  if (isFullscreen) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else if (el.requestFullscreen) {
    el.requestFullscreen();
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
  }
}

export default function ReceiptRowCard({ record, status, onFieldChange, onRemove }) {
  const [imageUrl, setImageUrl] = useState('');
  const imgRef = useRef(null);

  useEffect(() => {
    if (!record.imageBlob) return undefined;
    const url = URL.createObjectURL(record.imageBlob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [record.imageBlob]);

  return (
    <div className="card">
      <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{record.filename || 'Receipt'}</span>
        <button type="button" className="secondary" onClick={() => onRemove(record.id)}>
          Remove
        </button>
      </div>

      {record.error && (
        <p className="error-text">
          Could not read this image: {record.error}. Enter details manually or remove it.
        </p>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '0.5rem' }}>
        {imageUrl && (
          <img
            ref={imgRef}
            src={imageUrl}
            alt={record.filename}
            title="Click to toggle fullscreen"
            className="receipt-preview"
            onClick={() => imgRef.current && toggleFullscreen(imgRef.current)}
          />
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          <table>
            <tbody>
              <tr>
                <td>Date</td>
                <td>
                  <input
                    type="date"
                    required
                    value={record.date || ''}
                    onChange={(e) => onFieldChange(record.id, 'date', e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <td>Amount</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={record.amount ?? ''}
                    onChange={(e) => onFieldChange(record.id, 'amount', e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <td>Currency</td>
                <td>
                  <select
                    value={record.currency || 'NGN'}
                    onChange={(e) => onFieldChange(record.id, 'currency', e.target.value)}
                  >
                    {CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td>Category</td>
                <td>
                  <select
                    value={record.category || 'Other'}
                    onChange={(e) => onFieldChange(record.id, 'category', e.target.value)}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
          <details style={{ margin: '0.5rem 0' }}>
            <summary className="muted">Raw OCR text</summary>
            <pre className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {record.raw_ocr_text}
            </pre>
          </details>
        </div>
      </div>
      <p className={`muted ${status?.tone === 'error' ? 'error-text' : status?.tone === 'success' ? 'success-text' : ''}`}>
        {status?.text}
      </p>
    </div>
  );
}
