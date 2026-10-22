// Adapted from Studio Base UI file-manager/_components/file-grid-view.tsx (MIT).
// Kept Card composition; replaced local fixtures/state with controlled Allura files,
// Open details and Favorites. Removed nonfunctional upstream action menus.
import { Button } from "@studio/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@studio/components/ui/card"
import { FileSpreadsheet, FileText, Star } from "lucide-react"
import type { PreviewFile } from "../../files-state"

export interface FileViewProps {
  files: PreviewFile[]
  selectedId?: string
  onSelect: (id: string) => void
  onToggleStar: (id: string) => void
}
export function FileGridView({ files, selectedId, onSelect, onToggleStar }: FileViewProps): React.ReactElement {
  return (
    <div className="studio-file-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {files.map((file) => {
        const FileIcon = file.type === "Spreadsheet" ? FileSpreadsheet : FileText
        return (
          <Card key={file.id} size="sm" className="group/file" data-selected={selectedId === file.id}>
            <CardContent>
              <div className="studio-file-preview bg-muted/50 relative flex h-28 items-center justify-center rounded-lg">
                <FileIcon className="text-muted-foreground size-10" aria-hidden="true" />
                <Button
                  variant="secondary"
                  size="icon-sm"
                  className="absolute top-2 right-2"
                  aria-label={`${file.starred ? "Remove favorite" : "Favorite"} ${file.name}`}
                  aria-pressed={file.starred}
                  onClick={() => onToggleStar(file.id)}
                >
                  <Star className={file.starred ? "fill-current" : ""} />
                </Button>
                <div className="text-muted-foreground absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 text-xs">
                  <span>{file.type}</span>
                  <span>{file.sizeLabel}</span>
                </div>
              </div>
            </CardContent>
            <CardHeader>
              <CardTitle className="studio-file-name">
                <Button variant="link" className="px-0 text-left whitespace-normal" onClick={() => onSelect(file.id)}>
                  {file.name}
                </Button>
              </CardTitle>
              <CardDescription>
                {file.workspace} · {file.owner}
              </CardDescription>
              <CardAction>
                <span className="text-xs">v{file.version}</span>
              </CardAction>
            </CardHeader>
            {file.source.startsWith("Simulated Shopify") && (
              <CardContent>
                <p className="text-muted-foreground text-xs">{file.source}</p>
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
