// Adapted from Studio Base UI file-manager/_components/folders-section.tsx (MIT).
// Kept folder Card layout; live counts come from PreviewFiles. Replaced sample
// menus/share/rename/timestamps with a working controlled Open folder action.
import { Button } from "@studio/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@studio/components/ui/card"
import { Folder } from "lucide-react"

export function FoldersSection({
  folders,
  selected,
  onOpen,
}: {
  folders: { name: string; fileCount: number }[]
  selected: string
  onOpen: (name: string) => void
}): React.ReactElement {
  return (
    <section className="studio-folder-section flex flex-col gap-2" aria-labelledby="folders-heading">
      <div className="flex items-center justify-between">
        <h2 id="folders-heading" className="text-lg font-medium">
          Team folders
        </h2>
        <span className="text-muted-foreground text-sm">{folders.length} sample folders</span>
      </div>
      <div className="studio-folder-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {folders.map((folder) => (
          <Card key={folder.name} size="sm" data-selected={selected === folder.name}>
            <CardHeader>
              <div className="flex min-w-0 items-center gap-2">
                <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Folder className="size-4.5" aria-hidden="true" />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="leading-none">{folder.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {folder.fileCount} sample {folder.fileCount === 1 ? "file" : "files"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                variant="ghost"
                className="w-full justify-start"
                aria-pressed={selected === folder.name}
                onClick={() => onOpen(folder.name)}
              >
                Open {folder.name}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
