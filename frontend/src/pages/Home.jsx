import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Home() {
  const [events, setEvents] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/events');
        setEvents(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchEvents();
  }, []);

  const publishedEvents = events.filter(e => e.is_published);

  return (
    <div>
      <h1>Upcoming Hackathons</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem', marginTop: '1.5rem' }}>
        {publishedEvents.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No events available right now.</p> : publishedEvents.map(event => (
          <div key={event.id} className="card">
            <h3>{event.title}</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              {new Date(event.start_date).toLocaleDateString()} – {new Date(event.end_date).toLocaleDateString()}
            </p>
            {event.round_count > 0 && (
              <span className="badge badge-primary" style={{ marginBottom: '0.75rem', display: 'inline-block' }}>
                {event.round_count} round{event.round_count !== 1 ? 's' : ''}
              </span>
            )}
            <p>{event.description}</p>
            <button onClick={() => navigate(`/event/${event.id}`)} style={{ marginTop: '1rem', width: '100%' }}>View Details</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Home;
