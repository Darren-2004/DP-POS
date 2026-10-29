import React from 'react';
import DeliveriesView from '../../components/DeliveriesView';

export default function DeliveriesPanel({ currentUser }) {
  return (
    <div className="h-full flex flex-col bg-white">
      <DeliveriesView currentUser={currentUser} />
    </div>
  );
}