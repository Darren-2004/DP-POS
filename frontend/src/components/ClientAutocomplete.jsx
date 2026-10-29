import React, { useState, useEffect, useRef } from 'react';
import { User, Phone, Search, LoaderCircle, AlertCircle } from 'lucide-react';
import { API_BASE } from '../utils/constants';

export default function ClientAutocomplete({
  value = '',
  onChange = () => {},
  onSelectClient = () => {},
  placeholder = 'Nom du client',
  className = '',
  disabled = false,
  iconLeft = null
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef(null);

  // Fetch client suggestions when value changes
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 1) {
      setSuggestions([]);
      setIsOpen(false);
      setSuggestionError('');
      return;
    }

    let isMounted = true;
    const fetchClients = async () => {
      try {
        setLoading(true);
        setSuggestionError('');
        const res = await fetch(`${API_BASE}/clients?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error('Failed to fetch clients');
        const data = await res.json();
        
        if (isMounted) {
          setSuggestions(data || []);
          setIsOpen(true);
        }
      } catch (err) {
        console.error('Error fetching client suggestions:', err);
        if (isMounted) {
          setSuggestionError('Les suggestions clients sont indisponibles.');
          setIsOpen(true);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const timer = setTimeout(fetchClients, 150);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (client) => {
    onChange(client.name);
    onSelectClient(client);
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        {iconLeft && (
          <div className="absolute left-3 pointer-events-none text-[#7a5c4e]">
            {iconLeft}
          </div>
        )}
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (value.trim().length >= 1) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={className}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 text-[10px] font-bold text-[#b38059] animate-pulse">
            ...
          </div>
        )}
      </div>

      {/* Suggestions Dropdown Overlay */}
      {isOpen && value.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 max-h-52 overflow-y-auto rounded-2xl border border-[rgba(179,128,89,0.3)] bg-white p-1.5 shadow-2xl z-50 divide-y divide-[rgba(44,24,16,0.06)] animate-in fade-in duration-150">
          {loading ? (
            <div role="status" className="flex items-center gap-2 px-3 py-3 text-xs text-[#7a5c4e]">
              <LoaderCircle className="h-4 w-4 animate-spin text-[#b38059]" />
              Recherche des clients...
            </div>
          ) : suggestionError ? (
            <div role="alert" className="flex items-center gap-2 px-3 py-3 text-xs text-rose-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {suggestionError}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-[#7a5c4e]/70">
              <Search className="h-4 w-4 shrink-0" />
              Aucun client trouvé.
            </div>
          ) : (
            <>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#b38059]">
                Clients suggérés ({suggestions.length})
              </div>
              {suggestions.map((client, idx) => {
                const isHighlighted = idx === selectedIndex;
                return (
                  <div
                    key={client.id || idx}
                    onClick={() => handleSelect(client)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer rounded-xl text-xs transition-colors ${
                      isHighlighted
                        ? 'bg-[#faf4ed] text-[#b38059] font-bold'
                        : 'text-[#2c1810] hover:bg-[#faf7f2]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <User className="h-3.5 w-3.5 text-[#b38059] shrink-0" />
                      <span className="truncate font-medium">{client.name}</span>
                    </div>
                    {client.phone && (
                      <div className="flex items-center gap-1 text-[11px] text-[#7a5c4e] shrink-0 ml-2 font-mono">
                        <Phone className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}