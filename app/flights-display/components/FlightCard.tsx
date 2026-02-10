'use client';

import { useState } from 'react';

interface FlightCardProps {
  flight: {
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
  };
}

const statusColors = {
  'on-time': 'bg-green-100 text-green-800 border-green-300',
  'delayed': 'bg-red-100 text-red-800 border-red-300',
  'boarding': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'departed': 'bg-blue-100 text-blue-800 border-blue-300',
  'arrived': 'bg-purple-100 text-purple-800 border-purple-300',
};

const statusLabels = {
  'on-time': 'On Time',
  'delayed': 'Delayed',
  'boarding': 'Boarding',
  'departed': 'Departed',
  'arrived': 'Arrived',
};

export default function FlightCard({ flight }: FlightCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flight-card">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center">
            <span className="text-2xl font-bold mr-3">{flight.flightNumber}</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${statusColors[flight.status]}`}>
              {statusLabels[flight.status]}
            </span>
          </div>
          <p className="text-gray-600 mt-1">{flight.airline}</p>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <h4 className="font-semibold text-gray-700">Departure</h4>
          <p className="text-lg font-bold">{flight.departure.code}</p>
          <p className="text-gray-600">{flight.departure.city}</p>
          <p className="text-sm text-gray-500">Gate {flight.departure.gate}</p>
          <p className="font-medium">{flight.departure.time}</p>
        </div>
        <div>
          <h4 className="font-semibold text-gray-700">Arrival</h4>
          <p className="text-lg font-bold">{flight.arrival.code}</p>
          <p className="text-gray-600">{flight.arrival.city}</p>
          <p className="text-sm text-gray-500">Gate {flight.arrival.gate}</p>
          <p className="font-medium">{flight.arrival.time}</p>
        </div>
      </div>

      <div className="flex justify-between items-center text-sm text-gray-600 mb-4">
        <span>⏱️ {flight.duration}</span>
        <span>✈️ {flight.aircraft}</span>
      </div>

      {isExpanded && (
        <div className="pt-4 border-t border-gray-200">
          <h4 className="font-semibold mb-2">Flight Details</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Flight Type:</span>
              <span className="ml-2">Direct</span>
            </div>
            <div>
              <span className="text-gray-500">Distance:</span>
              <span className="ml-2">1,247 mi</span>
            </div>
            <div>
              <span className="text-gray-500">Seats Available:</span>
              <span className="ml-2">42</span>
            </div>
            <div>
              <span className="text-gray-500">Last Updated:</span>
              <span className="ml-2">Just now</span>
            </div>
          </div>
          <div className="mt-4 flex space-x-2">
            <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              Track Flight
            </button>
            <button className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50">
              View Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}