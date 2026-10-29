import re
import os

with open('frontend/src/views/CheckoutWorkspace.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add props
props_match = re.search(r'export default function CheckoutWorkspace\(\{(.*?)\}\) \{', content, re.DOTALL)
if props_match:
    props = props_match.group(1)
    new_props = props + ",\n  workspaces,\n  activeWorkspaceId,\n  onAddWorkspace,\n  onSwitchWorkspace,\n  onCloseWorkspace"
    content = content.replace(props, new_props)

# Add tabs UI
tabs_ui = '''
        <div className="flex items-center border-b border-white/10 mb-3 overflow-x-auto scrollbar-hide pb-1 gap-2">
          {workspaces?.map((w, idx) => {
            const isActive = w.id === activeWorkspaceId;
            const title = w.clientName ? w.clientName : f"Panier {idx + 1}";
            return (
              <div key={w.id} className={cx("flex items-center min-w-[100px] h-9 px-3 rounded-t-lg text-sm transition font-medium border-t border-l border-r", isActive ? "bg-[#111113] border-white/20 text-white" : "bg-transparent border-transparent text-white/50 hover:bg-white/5")}>
                <button type="button" onClick={() => onSwitchWorkspace(w.id)} className="flex-1 text-left truncate mr-2">{title}</button>
                {workspaces.length > 1 && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onCloseWorkspace(w.id); }} className="text-white/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            );
          })}
          <button type="button" onClick={onAddWorkspace} className="flex items-center justify-center h-8 w-8 rounded hover:bg-white/10 text-white/50 hover:text-white transition ml-1"><Plus className="w-4 h-4" /></button>
        </div>
'''

content = content.replace('<section className="flex min-h-[320px] flex-col xl:h-full xl:min-h-0" aria-label="Panier">', '<section className="flex min-h-[320px] flex-col xl:h-full xl:min-h-0" aria-label="Panier">' + tabs_ui)

content = content.replace('f"Panier {idx + 1}"', 'Panier ')

with open('frontend/src/views/CheckoutWorkspace.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
