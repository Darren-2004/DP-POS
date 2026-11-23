# Guide utilisateur — Dimitri Perfect POS

Ce guide décrit les actions disponibles selon le profil connecté. Les menus et les données visibles peuvent varier selon le rôle et le shop associé au compte.

## 1. Connexion

1. Sélectionnez votre nom sur l’écran de connexion.
2. Saisissez votre code PIN.
3. Lors de la première connexion, choisissez et confirmez un nouveau PIN si l’application vous le demande.
4. Pour terminer votre session, utilisez le bouton de déconnexion dans l’en-tête.

Ne communiquez pas votre PIN et ne laissez pas une session ouverte sur un poste partagé.

## 2. Profils et périmètre

| Profil | Accès principal | Limites |
|---|---|---|
| **Administrateur** | Vue globale et vues par shop, rapports, catalogue, stock, réservations, clients, formations, gestion des gérants, imprimantes et paramètres. | Peut agir sur l’ensemble du réseau. Les actions sensibles, comme l’annulation d’une facture, demandent une confirmation et un PIN autorisé. |
| **Gérant(e)** | Tableau de bord et opérations de son shop : ventes, factures, rapports, catalogue, stock, réservations, clients, formations et équipe de caissiers. Peut gérer les prestataires de son shop. | Ne peut pas consulter ou modifier les données de l’autre shop, gérer les comptes administrateurs ou les paramètres réseau, ni modifier le catalogue des formations. Un shop doit être associé à son compte. |
| **Caissier/ère** | Caisse, réservations, tickets du jour et rapport journalier. | Les ventes, tickets et statistiques sont limités à son compte et à son shop. Pas d’accès à l’administration, à la gestion des comptes ni au catalogue et aux paramètres. |

Un administrateur crée et gère les comptes des gérants. Un gérant crée, modifie et supprime les comptes de caissiers de son propre shop.

## 3. Caissier/ère — opérations de caisse

### Enregistrer une vente

1. Ouvrez **Caisse & Facturation**.
2. Sélectionnez une prestation dans le catalogue ou un produit disponible en stock. Utilisez la recherche si nécessaire.
3. Dans le ticket, vérifiez les lignes, les quantités et les prix. Pour une prestation, vous pouvez également choisir un prestataire si la liste est configurée.
4. Saisissez le nom et, si nécessaire, le téléphone du client. Le nom saisi sert aussi à nommer l’onglet du panier.
5. Choisissez le mode de paiement. Vous pouvez répartir le total entre plusieurs modes; la somme doit alors correspondre au montant à payer.
6. Vérifiez le total, puis validez l’encaissement pour enregistrer la facture et lancer l’impression.

### Utiliser plusieurs paniers

- **Nouveau panier** ouvre un ticket distinct sans effacer les autres.
- Chaque panier conserve ses articles, son client, son téléphone, son mode de paiement et, le cas échéant, les informations de rendez-vous.
- Dès que vous renseignez le nom du client, l’onglet prend ce nom. Sans nom, il reste affiché sous la forme « Panier ».
- Touchez un onglet pour reprendre le ticket correspondant.
- Fermer un panier contenant des éléments non enregistrés demande confirmation; la fermeture abandonne ces éléments.
- Après l’enregistrement réussi d’une vente ou d’un rendez-vous, son onglet disparaît automatiquement. Si c’était le dernier panier, un nouvel onglet vide est créé pour la prochaine vente.

### Créer un rendez-vous

1. Préparez le panier avec les prestations prévues.
2. Choisissez **Rendez-vous**.
3. Renseignez le nom ou le téléphone du client, puis la date et l’heure si elles sont connues.
4. Indiquez éventuellement un acompte, répartissez son paiement si nécessaire et confirmez.

Un acompte est enregistré comme paiement de réservation. Il est déduit du ticket lorsque le rendez-vous est transféré à la caisse.

### Autres menus du caissier

- **Réservations & Calendrier** : consulter les rendez-vous et leurs informations; transférer un rendez-vous vers la caisse lorsqu’il est prêt à être facturé.
- **Tickets du Jour** : consulter les factures associées à votre compte et réimprimer un ticket lorsque l’action est disponible.
- **Rapport Journalier** : consulter vos totaux de caisse et vos opérations.

## 4. Gérant(e) — gestion du shop

Le gérant dispose des opérations de caisse décrites ci-dessus et des menus d’administration associés à son shop.

- **Tableau de bord** : consulter les ventes et indicateurs du shop, choisir une période et filtrer par opérateur ou prestataire lorsque le filtre est proposé.
- **Journal des tickets/factures** : rechercher et consulter les factures du shop. L’annulation d’une facture exige un motif et un PIN autorisé; une facture ne se supprime pas.
- **Rapports de clôture** : afficher les rapports financiers et le rapport Z pour le shop.
- **Prestations & Tarifs** : gérer les catégories et prestations du shop et administrer ses prestataires.
- **Stock** : consulter et gérer les produits et catégories de stock du shop.
- **Réservations** : consulter le planning et effectuer les actions proposées sur les rendez-vous.
- **Clients** : consulter le fichier clients et les informations de suivi disponibles.
- **Formations & apprenants** : inscrire un apprenant, encaisser ses tranches, modifier son échéance et consulter l’historique. Le gérant peut marquer une formation comme terminée, l’annuler ou supprimer l’inscription.
- **Équipe caissiers** : créer, modifier et supprimer les comptes de caissiers rattachés à son shop.

### Comptabilité des formations

- **Terminer** déplace le dossier vers la liste des formations terminées sans retirer ses paiements des recettes.
- **Annuler** rend l’inscription inactive et conserve les paiements déjà encaissés dans le chiffre d’affaires.
- **Supprimer** masque le dossier des listes habituelles et régularise ses paiements validés afin de les déduire du chiffre d’affaires. Une trace de l’opération reste dans le journal.
- Les listes des formations en cours et terminées sont paginées séparément, par 20 dossiers.
- Sans période sélectionnée, les indicateurs de formation portent sur toutes les dates. Choisissez les dates « Du » et « Au » pour filtrer les statistiques.
- L’administrateur, et non le gérant, crée ou modifie les formations du catalogue.

## 5. Administrateur — pilotage du réseau

L’administrateur peut agir sur le réseau complet ou sélectionner un shop dans les vues qui le permettent.

- **Vue Réseau Consolidée / vues par shop** : consulter les indicateurs, comparer les shops et examiner les tendances. Les filtres de dates, d’opérateur ou de prestataire s’appliquent aux indicateurs concernés.
- **Journal des Factures** : consulter les ventes. Une annulation exige un motif et un PIN autorisé; l’historique comptable est conservé.
- **Clôtures & Rapports Z** : préparer et consulter les rapports de clôture et synthèses de vente.
- **Prestations & Tarifs** : gérer le catalogue des prestations, catégories, tarifs et prestataires.
- **Stock** : créer et modifier les produits, leur prix, leur quantité et leur catégorie; suivre les indicateurs et alertes de stock.
- **Réservations & Planning** : consulter et gérer les réservations du réseau.
- **Fichier Clients & Fidélité** : consulter les fiches et indicateurs clients.
- **Formations & apprenants** : créer et modifier le catalogue des formations; consulter les apprenants des deux shops; gérer les inscriptions, paiements et statuts.
- **Équipe & Gérants** : créer, modifier et supprimer les comptes de gérants et leur attribuer un shop. Les gérants gèrent ensuite leurs caissiers.
- **Imprimantes & Caisses** : consulter les postes d’impression et gérer les périphériques enregistrés. La suppression d’un périphérique demande le PIN administrateur.
- **Paramètres & Sauvegardes** : modifier les noms des shops, consulter l’état du système et créer une sauvegarde de la base de données.

Sur téléphone, la navigation de l’administration se trouve dans une barre horizontale défilante sous l’en-tête.

## 6. Bonnes pratiques

- Vérifiez le shop, le nom du client, les lignes et le total avant de confirmer une vente.
- N’annulez une facture qu’en indiquant le motif demandé. Utilisez les corrections prévues plutôt que de supprimer des données comptables.
- Effectuez et vérifiez les clôtures selon la procédure de votre établissement.
- Créez régulièrement des sauvegardes depuis **Paramètres & Sauvegardes** si cette responsabilité vous est confiée.
- Si le serveur apparaît hors ligne ou si une opération échoue, ne la répétez pas immédiatement sans vérifier les tickets et l’historique; demandez l’aide d’un administrateur.
