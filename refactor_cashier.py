import re

with open('frontend/src/views/CashierView.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the state definitions with workspaces logic
state_pattern = r"  const \[cart, setCart\] = useState\(\[\]\);.*?  const toggleExpandCategory = \(catId\) => \{.*?    \);\n  \};\n"

new_state = '''
  const createNewWorkspace = (id) => ({
    id,
    cart: [],
    clientName: '',
    clientPhone: '',
    selectedMethods: ['CASH'],
    methodAmounts: { CASH: '', ONLINE: '', ORANGE_MONEY: '' },
    showReservationMode: false,
    reservationAdvanceInput: '',
    showDeliveryMode: false,
    deliveryAddress: '',
    deliveryFee: '',
    categorySearch: '',
    expandedCatIds: []
  });

  const [workspaces, setWorkspaces] = useState([createNewWorkspace(1)]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(1);
  const [nextWorkspaceId, setNextWorkspaceId] = useState(2);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const activeWorkspaceIndex = workspaces.findIndex(w => w.id === activeWorkspaceId);
  const activeWorkspace = workspaces[activeWorkspaceIndex] || workspaces[0];

  const updateActiveWorkspace = (updates) => {
    setWorkspaces(prev => {
      const newWorkspaces = [...prev];
      const idx = newWorkspaces.findIndex(w => w.id === activeWorkspaceId);
      if (idx !== -1) {
        newWorkspaces[idx] = { ...newWorkspaces[idx], ...updates };
      }
      return newWorkspaces;
    });
  };

  const handleAddWorkspace = () => {
    const id = nextWorkspaceId;
    setNextWorkspaceId(id + 1);
    setWorkspaces(prev => [...prev, createNewWorkspace(id)]);
    setActiveWorkspaceId(id);
  };

  const handleSwitchWorkspace = (id) => {
    setActiveWorkspaceId(id);
  };

  const handleCloseWorkspace = (id) => {
    setWorkspaces(prev => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter(w => w.id !== id);
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(filtered[0].id);
      }
      return filtered;
    });
  };

  const cart = activeWorkspace.cart;
  const setCart = (val) => updateActiveWorkspace({ cart: typeof val === 'function' ? val(activeWorkspace.cart) : val });

  const clientName = activeWorkspace.clientName;
  const setClientName = (val) => updateActiveWorkspace({ clientName: val });

  const clientPhone = activeWorkspace.clientPhone;
  const setClientPhone = (val) => updateActiveWorkspace({ clientPhone: val });

  const selectedMethods = activeWorkspace.selectedMethods;
  const setSelectedMethods = (val) => updateActiveWorkspace({ selectedMethods: val });

  const methodAmounts = activeWorkspace.methodAmounts;
  const setMethodAmounts = (val) => updateActiveWorkspace({ methodAmounts: val });

  const showReservationMode = activeWorkspace.showReservationMode;
  const setShowReservationMode = (val) => updateActiveWorkspace({ showReservationMode: val });

  const reservationAdvanceInput = activeWorkspace.reservationAdvanceInput;
  const setReservationAdvanceInput = (val) => updateActiveWorkspace({ reservationAdvanceInput: val });

  const showDeliveryMode = activeWorkspace.showDeliveryMode;
  const setShowDeliveryMode = (val) => updateActiveWorkspace({ showDeliveryMode: val });

  const deliveryAddress = activeWorkspace.deliveryAddress;
  const setDeliveryAddress = (val) => updateActiveWorkspace({ deliveryAddress: val });

  const deliveryFee = activeWorkspace.deliveryFee;
  const setDeliveryFee = (val) => updateActiveWorkspace({ deliveryFee: val });

  const categorySearch = activeWorkspace.categorySearch;
  const setCategorySearch = (val) => updateActiveWorkspace({ categorySearch: val });

  const expandedCatIds = activeWorkspace.expandedCatIds;
  const setExpandedCatIds = (val) => updateActiveWorkspace({ expandedCatIds: typeof val === 'function' ? val(activeWorkspace.expandedCatIds) : val });

  const toggleExpandCategory = (catId) => {
    setExpandedCatIds(prev =>
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  const getFinalPaymentMethod = () => {
    if (selectedMethods.length === 0) return 'CASH';
    if (selectedMethods.length === 1) return selectedMethods[0];
    const parts = selectedMethods.map(m => {
      const v = parseFloat(methodAmounts[m]) || 0;
      return ${m}=;
    });
    return MULTIPLE:;
  };

  const validateMultiplePayments = (targetTotal) => {
    if (selectedMethods.length <= 1) return true;
    const sum = selectedMethods.reduce((acc, m) => acc + (parseFloat(methodAmounts[m]) || 0), 0);
    if (Math.abs(sum - targetTotal) > 0.01) {
      showToast(Le montant total r?parti () ne correspond pas au montant requis ()., 'error');
      return false;
    }
    return true;
  };

'''

content = re.sub(r"  const \[cart, setCart\] = useState\(\[\]\);.*?  const toggleExpandCategory = \(catId\) => \{.*?    \);\n  \};\n", new_state, content, flags=re.DOTALL)

# Now pass the new workspace props to CheckoutWorkspace
checkout_ws_pattern = r"<CheckoutWorkspace\s*(.*?)\s*/>"
def replace_props(match):
    props = match.group(1)
    return f"""<CheckoutWorkspace
      {props}
      workspaces={{workspaces}}
      activeWorkspaceId={{activeWorkspaceId}}
      onAddWorkspace={{handleAddWorkspace}}
      onSwitchWorkspace={{handleSwitchWorkspace}}
      onCloseWorkspace={{handleCloseWorkspace}}
    />"""

content = re.sub(checkout_ws_pattern, replace_props, content, flags=re.DOTALL)

with open('frontend/src/views/CashierView.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Refactored CashierView.jsx")
