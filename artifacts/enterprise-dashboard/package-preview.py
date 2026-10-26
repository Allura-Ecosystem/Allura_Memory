from pathlib import Path
import base64, mimetypes, re
root=Path(__file__).resolve().parent
bundle=root/'html-preview'
html=(bundle/'index.html').read_text()
studio_license=(root/'visual-fixture'/'studio-ui'/'LICENSE').read_text()
html=html.replace('</head>', '<!-- Reused Studio Admin UI components; MIT notice retained.\n'+studio_license+'\n-->\n</head>')
baseui_license=(root/'visual-fixture'/'studio-baseui'/'LICENSE').read_text()
html=html.replace('</head>', '<!-- Studio Admin Base UI page components; MIT notice retained.\n'+baseui_license+'\n-->\n</head>')
graph_license=(root/'visual-fixture'/'third-party'/'react-force-graph'/'LICENSE').read_text()
html=html.replace('</head>', '<!-- react-force-graph — https://github.com/vasturiano/react-force-graph; MIT notice retained.\n'+graph_license+'\n-->\n</head>')
graph_notices=(root/'visual-fixture'/'third-party'/'react-force-graph'/'THIRD-PARTY-NOTICES.txt').read_text()
html=html.replace('</head>', '<!-- Pinned graph dependency notices.\n'+graph_notices.replace('--','—')+'\n-->\n</head>')
def data_uri(path):
    mime=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()
def css_inline(match):
    path=bundle/match.group(1).removeprefix('./')
    css=path.read_text()
    def url_inline(m):
        value=m.group(1).strip('"\'')
        if value.startswith(('data:','http:','https:','#')):return m.group(0)
        asset=(path.parent/value).resolve()
        return 'url('+data_uri(asset)+')'
    css=re.sub(r'url\(([^)]+)\)',url_inline,css)
    return '<style>'+css+'</style>'
html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>',css_inline,html)
def script_inline(match):
    js=(bundle/match.group(1).removeprefix('./')).read_text()
    for name in ('allura-wordmark-runtime.png', 'allura-lettermark-al-figma.png'):
        js=js.replace('/brand/'+name,data_uri(bundle/'brand'/name))
    return '<script type="module">'+js.replace('</script','<\\/script')+'</script>'
html=re.sub(r'<script[^>]*src="([^"]+)"[^>]*></script>',script_inline,html)
output=Path('/home/ronin704/ChatGPT/Allura memory/output/Allura-dashboard-preview.html')
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(html)
(bundle/'Allura-dashboard-preview.html').write_text(html)
(bundle/'live.html').write_text(html)
print(f'Self-contained design preview: {output} ({output.stat().st_size} bytes)')
