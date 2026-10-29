# JOEL SHOP POS Information Architecture

## Product Shells

- **Cashier shell:** touch-friendly, persistent navigation for Caisse, Mes ventes, Statistiques, Réservations, and Livraisons. Visibility continues to follow the existing cashier permission values. Checkout keeps the cart and completion actions in view.
- **Admin shell:** management workspace with grouped destinations and filters. Administrators can switch to the cashier workspace without signing out.

## Admin Destinations

- **Overview:** Tableau de bord, Rapport Z, Rapport des ventes produits.
- **Operations:** Livraisons, Réservations.
- **Catalog:** Catégories and subcategories, including batch subcategory creation.
- **People:** Clients and Caissières / team management.

## Data Contract Guardrails

The redesign uses the existing frontend API bindings only. It does not introduce endpoints, change request methods or payloads, reinterpret response shapes, or move business calculations into new services. Reports, customer metrics, invoice operations, reservation operations, delivery workflows, user management, and category/subcategory CRUD remain backed by their current calls.

If a response omits optional detail, the screen shows the fields that are available and uses a clear empty or unavailable state for the rest. No synthetic metrics or substitute API data are introduced. Existing print station selection remains optional for locations without a configured printer.

## Contract Gap

Invoice deletion currently has an `x-admin-pin` verification contract. Reservation cancellation and deletion routes do not accept or verify an administrator PIN. The UI therefore retains their existing administrator-only confirmation flow; adding secure PIN re-verification requires an explicit backend contract change and is not simulated client-side.
