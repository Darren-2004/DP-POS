import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_BASE } from '../utils/constants';
import { apiFetch } from '../utils/helpers';

const DEFAULT_SHOP_NAMES = { HOMME: 'Shop 1', FEMME: 'Shop 2' };
const ShopNamesContext = createContext({
  shopNames: DEFAULT_SHOP_NAMES,
  saveShopNames: async () => {},
});

export function ShopNamesProvider({ children }) {
  const [shopNames, setShopNames] = useState(DEFAULT_SHOP_NAMES);

  useEffect(() => {
    let active = true;
    apiFetch(`${API_BASE}/settings/shop-names`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Impossible de charger les noms des shops');
        const names = await response.json();
        if (active) {
          setShopNames({
            HOMME: names.HOMME || DEFAULT_SHOP_NAMES.HOMME,
            FEMME: names.FEMME || DEFAULT_SHOP_NAMES.FEMME,
          });
        }
      })
      .catch((error) => console.error('Erreur lors du chargement des noms des shops:', error));
    return () => {
      active = false;
    };
  }, []);

  const saveShopNames = useCallback(async (names) => {
    const response = await apiFetch(`${API_BASE}/settings/shop-names`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(names),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.detail || 'Impossible d’enregistrer les noms des shops');
    }
    setShopNames(data);
    return data;
  }, []);

  return (
    <ShopNamesContext.Provider value={{ shopNames, saveShopNames }}>
      {children}
    </ShopNamesContext.Provider>
  );
}

export function useShopNames() {
  return useContext(ShopNamesContext);
}
