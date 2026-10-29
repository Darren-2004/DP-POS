with open('frontend/src/views/CheckoutWorkspace.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('const title = w.clientName ? w.clientName : Panier ;', 'const title = w.clientName ? w.clientName : Panier ;')
content = content.replace('const title = w.clientName ? w.clientName : f\"Panier {idx + 1}\";', 'const title = w.clientName ? w.clientName : Panier ;')

with open('frontend/src/views/CheckoutWorkspace.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
