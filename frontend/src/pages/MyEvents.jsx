import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function MyEvents() {
  const [events, setEvents] = useState([]);
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMyEvents = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/users/me/events', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setEvents(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchMyEvents();
  }, [token]);

  return (
    <div>
      <h1>My Events</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Events you're organizing, judging, or mentoring.
      </p>
      
      {events.length === 0 ? (
        <div className="card" style={{ opacity: 0.7, textAlign: 'center' }}>
          <p>You don't have any assigned events yet.</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Create a hackathon or wait for an organizer to invite you.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {events.map(e => (
            <div key={e.id} className="card" style={{ borderColor: e.roles.includes('Organizer') ? 'var(--primary)' : 'var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>{e.title}</h3>
                <span className={`badge ${e.is_published ? 'badge-accent' : 'badge-primary'}`} style={{ fontSize: '0.7rem' }}>
                  {e.is_published ? 'Published' : 'Draft'}
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                {new Date(e.start_date).toLocaleDateString()}
              </p>
              <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1rem' }}>
                {e.roles.map(r => (
                  <span key={r} className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{r}</span>
                ))}
              </div>
              <button onClick={() => navigate(`/event/${e.id}`)} style={{ width: '100%' }}>
                {e.roles.includes('Organizer') ? 'Manage Event' : 'View Event'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyEvents;
