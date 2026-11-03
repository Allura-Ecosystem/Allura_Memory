import { Badge } from "@studio/components/ui/badge"
import { Button } from "@studio/components/ui/button"
import { Input } from "@studio/components/ui/input"
import { Folder, Grid2X2, Link2, List, Plus, Star } from "lucide-react"
import { useState } from "react"
import { canLinkFile, usePreviewFiles } from "./files-state"
import { usePreviewWork } from "./preview-work-state"
import { FileGridView } from "./studio-adapters/files/file-grid-view"
import { FileListView } from "./studio-adapters/files/file-list-view"
import { FoldersSection } from "./studio-adapters/files/folders-section"
import "./files-connections.css"

export function FilesPage({ previewRole }: { previewRole: string }): React.ReactElement {
  const model = usePreviewFiles()
  const work = usePreviewWork()
  const initial = new URLSearchParams(window.location.hash.split("?")[1]).get("file")
  const [selectedId, setSelectedId] = useState(initial || "FILE-001")
  const [reviewAssignee, setReviewAssignee] = useState("")
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [folder, setFolder] = useState("All files")
  const [starredOnly, setStarredOnly] = useState(false)
  const [message, setMessage] = useState("")
  const [taskId, setTaskId] = useState("")
  const editable = previewRole === "Curator" || previewRole === "Admin"
  const files = model.files.filter(
    (file) =>
      (folder === "All files" || file.workspace === folder) &&
      (!starredOnly || file.starred) &&
      `${file.name} ${file.owner} ${file.source}`.toLowerCase().includes(query.toLowerCase())
  )
  const selected = model.files.find((file) => file.id === selectedId)
  const visibleSelected = selected && files.some((file) => file.id === selected.id) ? selected : null
  const selectedReviewAssignee =
    reviewAssignee || (selected && work.assignees.includes(selected.owner) ? selected.owner : "")
  const eligibleTasks = selected ? work.tasks.filter((task) => canLinkFile(selected, task)) : []
  function selectFile(id: string): void {
    setSelectedId(id)
    setReviewAssignee("")
    setMessage("")
    setTaskId("")
    window.history.replaceState(null, "", `#files?file=${encodeURIComponent(id)}`)
  }
  return (
    <div className="files-page studio-preview studio-source">
      <div className="files-heading">
        <div>
          <p className="files-eyebrow">Your shared sources</p>
          <h2>Files</h2>
          <p>Find the source. Bring it into the work.</p>
        </div>
        <Button
          disabled={!editable}
          onClick={() => {
            const id = model.addSampleFile()
            setFolder("All files")
            setQuery("")
            setStarredOnly(false)
            selectFile(id)
            setMessage("Added fictional meeting notes. No real file was uploaded.")
          }}
        >
          <Plus aria-hidden="true" size={16} /> Add sample file
        </Button>
      </div>
      <p className="files-note">
        Portfolio examples only. Files and task links stay in this preview until you reload. Team filters demonstrate
        organization, not real access enforcement.
      </p>
      <div className="files-toolbar">
        <label>
          Search files
          <Input
            aria-label="Search files"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, owner, or source"
          />
        </label>
        <label>
          Team folder
          <select
            value={folder}
            onChange={(event) => {
              setFolder(event.target.value)
              setTaskId("")
            }}
          >
            {["All files", "Company Knowledge", "HR", "Marketing", "IT", "Sales", "Mortgage"].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <Button variant="outline" aria-pressed={starredOnly} onClick={() => setStarredOnly(!starredOnly)}>
          <Star size={16} aria-hidden="true" />
          {starredOnly ? "Showing favorites" : "Favorites"}
        </Button>
      </div>
      <FoldersSection
        folders={["Company Knowledge", "HR", "Marketing", "IT", "Sales", "Mortgage"].map((name) => ({
          name,
          fileCount: model.files.filter((file) => file.workspace === name).length,
        }))}
        selected={folder}
        onOpen={(name) => {
          setFolder(name)
          setQuery("")
          setStarredOnly(false)
          setTaskId("")
        }}
      />
      <div className="files-layout">
        <section aria-label="File list">
          <div className="files-list-heading">
            <Folder size={18} aria-hidden="true" />
            <h2>{folder}</h2>
            <span>
              {files.length} sample {files.length === 1 ? "file" : "files"}
            </span>
          </div>
          <div className="studio-file-view-controls" role="group" aria-label="File view">
            <Button variant="outline" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
              <Grid2X2 size={16} aria-hidden="true" />
              Grid view
            </Button>
            <Button variant="outline" aria-pressed={view === "list"} onClick={() => setView("list")}>
              <List size={16} aria-hidden="true" />
              List view
            </Button>
          </div>
          {view === "grid" ? (
            <FileGridView
              files={files}
              selectedId={visibleSelected?.id}
              onSelect={selectFile}
              onToggleStar={model.toggleStar}
            />
          ) : (
            <FileListView
              files={files}
              selectedId={visibleSelected?.id}
              onSelect={selectFile}
              onToggleStar={model.toggleStar}
            />
          )}
          {files.length === 0 && (
            <div className="files-empty">
              <h3>No matching files</h3>
              <p>Try another name or folder.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("")
                  setFolder("All files")
                  setStarredOnly(false)
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </section>
        <aside className="file-inspector" aria-label="File details">
          {visibleSelected ? (
            <>
              <Badge variant="outline">Fictional source · v{visibleSelected.version}</Badge>
              <h2>{visibleSelected.name}</h2>
              <a href={`#graph?focus=${encodeURIComponent(`file:${visibleSelected.id}`)}`}>See connections →</a>
              <dl>
                <div>
                  <dt>Owner</dt>
                  <dd>{visibleSelected.owner}</dd>
                </div>
                <div>
                  <dt>Team</dt>
                  <dd>{visibleSelected.workspace}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{visibleSelected.source}</dd>
                </div>
              </dl>
              <h3>Preview contents</h3>
              <pre>{visibleSelected.content}</pre>
              <details>
                <summary>Rename sample file</summary>
                <form
                  key={visibleSelected.id}
                  onSubmit={(event) => {
                    event.preventDefault()
                    const data = new FormData(event.currentTarget)
                    setMessage(
                      model.renameFile(visibleSelected.id, String(data.get("filename"))) ||
                        "Sample name updated. File contents and version are unchanged."
                    )
                  }}
                >
                  <label>
                    File name
                    <Input
                      name="filename"
                      defaultValue={visibleSelected.name}
                      minLength={3}
                      maxLength={100}
                      required
                      disabled={!editable}
                    />
                  </label>
                  <Button type="submit" variant="outline" disabled={!editable}>
                    Save name
                  </Button>
                </form>
              </details>
              <h3>
                <Link2 size={16} aria-hidden="true" /> Linked work
              </h3>
              {model.tasksForFile(visibleSelected.id).length ? (
                <ul className="file-task-links">
                  {model.tasksForFile(visibleSelected.id).map((task) => (
                    <li key={task.id}>
                      <a href={`#work?task=${task.id}`}>{task.title}</a>
                      <small>
                        {task.id} · {task.stage}
                      </small>
                      <Button
                        variant="ghost"
                        disabled={!editable}
                        onClick={() => {
                          model.unlinkFileFromTask(visibleSelected.id, task.id)
                          setMessage("Sample file link removed. The task now needs review again where required.")
                        }}
                        aria-label={`Unlink ${task.id}`}
                      >
                        Unlink
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No tasks linked yet.</p>
              )}
              <label>
                Link an existing task
                <select value={taskId} onChange={(event) => setTaskId(event.target.value)} disabled={!editable}>
                  <option value="">Choose a task in this team</option>
                  {eligibleTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.id} · {task.title}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="outline"
                disabled={!editable || !taskId}
                onClick={() =>
                  setMessage(
                    model.linkFileToTask(visibleSelected.id, taskId) ||
                      "File linked to the sample task. Open Linked work to continue."
                  )
                }
              >
                Link file to task
              </Button>
              <label>
                New task owner
                <select
                  aria-label="New task owner"
                  disabled={!editable}
                  value={selectedReviewAssignee}
                  onChange={(event) => setReviewAssignee(event.target.value)}
                >
                  <option value="">Choose an active person</option>
                  {work.assignees.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              {!work.assignees.includes(visibleSelected.owner) && (
                <p className="files-note">
                  The file owner is paused or unavailable. Choose an active person for a new task.
                </p>
              )}
              <Button
                disabled={!editable || !work.assignees.includes(selectedReviewAssignee)}
                onClick={() => {
                  const id = model.createTaskForFile(visibleSelected.id, selectedReviewAssignee)
                  if (id) window.location.hash = `work?task=${id}`
                  else setMessage("Choose an active person as the new task owner.")
                }}
              >
                Create review task
              </Button>
              <small>Task creation captures these sample contents. File links do not grant access.</small>
            </>
          ) : (
            <div className="files-empty">
              <h2>Choose a file</h2>
              <p>Select a file from the list to see its contents and linked work.</p>
            </div>
          )}
        </aside>
      </div>
      {!editable && (
        <p className="files-note">
          Reader example: file changes and task links need an Editor or Administrator in Preview options.
        </p>
      )}
      {message && (
        <p className="files-feedback" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
