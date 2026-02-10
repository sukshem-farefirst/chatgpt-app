'use client';

import { useState, useEffect } from 'react';
import FlightCard from './components/FlightCard';

interface FlightCard {
  id: number;
  flightNumber: string;
  airline: string;
  departure: {
    city: string;
    code: string;
    time: string;
    gate: string;
  };
  arrival: {
    city: string;
    code: string;
    time: string;
    gate: string;
  };
  status: 'on-time' | 'delayed' | 'boarding' | 'departed' | 'arrived';
  aircraft: string;
  duration: string;
}

export default function FlightsDisplayPage() {
  const [flights, setFlights] = useState<FlightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/cards')
      .then(res => res.json())
      .then(data => {
        setFlights(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching flights:', error);
        setLoading(false);
      });
  }, []);

  const filteredFlights = flights.filter(flight => {
    if (filter === 'all') return true;
    return flight.status === filter;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-lg">Loading flight data...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Flights Display</h1>
        <div className="flex space-x-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="all">All Flights</option>
            <option value="on-time">On Time</option>
            <option value="boarding">Boarding</option>
            <option value="delayed">Delayed</option>
            <option value="departed">Departed</option>
            <option value="arrived">Arrived</option>
          </select>
          <button 
            onClick={() => setFilter('all')}
            className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Clear Filter
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFlights.map((flight) => (
          <FlightCard key={flight.id} flight={flight} />
        ))}
      </div>

      {filteredFlights.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">✈️</div>
          <h3 className="text-xl font-semibold mb-2">No flights found</h3>
          <p className="text-gray-600">Try selecting a different filter</p>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold mb-2">Displaying {filteredFlights.length} of {flights.length} flights</h3>
        <div className="flex space-x-4 text-sm">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            <span>On Time</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
            <span>Boarding</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
            <span>Delayed</span>
          </div>
        </div>
      </div>
    </div>
  );
}