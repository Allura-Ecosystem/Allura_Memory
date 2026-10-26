// Adapted from Studio Base UI file-manager/_components/file-list-view.tsx (MIT).
// Kept Table/Avatar/Button composition, with controlled Allura files and shared
// Favorites. Replaced invented timestamps with real sample version/team fields.
import { Avatar, AvatarFallback } from "@studio/components/ui/avatar"
import { Badge } from "@studio/components/ui/badge"
import { Button } from "@studio/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@studio/components/ui/table"
import { FileSpreadsheet, FileText, Star } from "lucide-react"
import type { FileViewProps } from "./file-grid-view"

export function FileListView({ files, selectedId, onSelect, onToggleStar }: FileViewProps): React.ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-0">Name</TableHead>
          <TableHead className="file-owner-column">Owner</TableHead>
          <TableHead className="file-team-column">Team</TableHead>
          <TableHead className="file-size-column">Size</TableHead>
          <TableHead>
            <span className="sr-only">Favorite</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => {
          const FileIcon = file.type === "Spreadsheet" ? FileSpreadsheet : FileText
          return (
            <TableRow key={file.id} data-state={selectedId === file.id ? "selected" : undefined}>
              <TableCell className="pl-0">
                <div className="flex min-w-0 items-center gap-3">
                  <FileIcon className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto max-w-72 justify-start px-0 text-left whitespace-normal"
                    onClick={() => onSelect(file.id)}
                  >
                    <span>{file.name}</span>
                  </Button>
                  {file.workspace === "Company Knowledge" && (
                    <Badge variant="outline" className="file-shared-badge">
                      Shared sample
                    </Badge>
                  )}
                </div>
                <small>
                  {file.type} · v{file.version}
                  {file.source.startsWith("Simulated Shopify") && (
                    <>
                      <br />
                      {file.source}
                    </>
                  )}
                </small>
              </TableCell>
              <TableCell className="file-owner-column">
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarFallback>
                      {file.owner
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span>{file.owner}</span>
                </div>
              </TableCell>
              <TableCell className="file-team-column">{file.workspace}</TableCell>
              <TableCell className="file-size-column">{file.sizeLabel}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${file.starred ? "Remove favorite" : "Favorite"} ${file.name}`}
                    aria-pressed={file.starred}
                    onClick={() => onToggleStar(file.id)}
                  >
                    <Star className={file.starred ? "fill-current" : ""} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
