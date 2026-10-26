import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react"
import { type PreviewTask, usePreviewWork } from "./preview-work-state"

export interface PreviewFile {
  id: string
  name: string
  workspace: string
  owner: string
  type: string
  sizeLabel: string
  version: number
  content: string
  starred: boolean
  source: string
}
export interface PreviewFileLink {
  fileId: string
  taskId: string
  fileVersion: number
}
export type SampleConnectionStatus = "Not connected" | "Sample connected" | "Paused"
export interface SampleShopify {
  store: string
  products: boolean
  inventory: boolean
  status: SampleConnectionStatus
  imported: boolean
  message: string
}
export function canLinkFile(file: PreviewFile, task: Pick<PreviewTask, "workspace">): boolean {
  return file.workspace === "Company Knowledge" || file.workspace === task.workspace
}
export function validSampleStore(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/i.test(value.trim())
}
export function sampleShopifyFileId(store: string, kind: "products" | "inventory"): string {
  return `SHOPIFY-${store.trim().toLowerCase()}-${kind.toUpperCase()}`
}
function seedFiles(): PreviewFile[] {
  return [
    {
      id: "FILE-001",
      name: "Company handbook.txt",
      workspace: "Company Knowledge",
      owner: "Alex Morgan",
      type: "Document",
      sizeLabel: "2 KB",
      version: 1,
      content:
        "Fictional handbook excerpt: welcome to Allura. Start with your team’s shared knowledge, ask the document owner about changes, and link the source when you create a work task.",
      starred: true,
      source: "Portfolio sample",
    },
    {
      id: "FILE-002",
      name: "Campaign brief.txt",
      workspace: "Marketing",
      owner: "Sam Rivera",
      type: "Document",
      sizeLabel: "1 KB",
      version: 1,
      content:
        "Fictional campaign brief: introduce company knowledge to new colleagues. Review the source attribution before the example campaign is shared.",
      starred: false,
      source: "Portfolio sample",
    },
    {
      id: "FILE-003",
      name: "Recovery exercise notes.txt",
      workspace: "IT",
      owner: "Taylor Chen",
      type: "Document",
      sizeLabel: "1 KB",
      version: 1,
      content:
        "Fictional exercise notes. The recovery checklist needs an owner, a planned test, and recorded results. This sample contains no evidence of a real recovery test.",
      starred: false,
      source: "Portfolio sample",
    },
    {
      id: "FILE-004",
      name: "Sales product catalog.csv",
      workspace: "Sales",
      owner: "Alex Morgan",
      type: "Spreadsheet",
      sizeLabel: "1 KB",
      version: 1,
      content:
        "Example item,Description\nWelcome kit,Fictional onboarding bundle\nDesk notebook,Fictional stationery item",
      starred: false,
      source: "Portfolio sample",
    },
  ]
}
const seedLinks = (): PreviewFileLink[] => [
  { fileId: "FILE-001", taskId: "WORK-001", fileVersion: 1 },
  { fileId: "FILE-002", taskId: "WORK-003", fileVersion: 1 },
  { fileId: "FILE-003", taskId: "WORK-004", fileVersion: 1 },
]
interface FilesValue {
  files: PreviewFile[]
  links: PreviewFileLink[]
  shopify: SampleShopify
  addSampleFile: () => string
  renameFile: (id: string, name: string) => string | null
  toggleStar: (id: string) => void
  linkFileToTask: (fileId: string, taskId: string) => string | null
  unlinkFileFromTask: (fileId: string, taskId: string) => void
  filesForTask: (taskId: string) => PreviewFile[]
  tasksForFile: (fileId: string) => PreviewTask[]
  createTaskForFile: (fileId: string, assignee?: string) => string | null
  connectShopify: (store: string, products: boolean, inventory: boolean) => string | null
  pauseShopify: () => void
  disconnectShopify: () => void
  importShopify: (fail?: boolean) => string | null
}
const FilesContext = createContext<FilesValue | null>(null)
export function PreviewFilesProvider({ children }: { children: ReactNode }): React.ReactElement {
  const work = usePreviewWork()
  const [files, setFiles] = useState(seedFiles)
  const [links, setLinks] = useState(seedLinks)
  const nextId = useRef(5)
  const resetSeen = useRef(work.resetEpoch)
  const [shopify, setShopify] = useState<SampleShopify>({
    store: "allura-sample.myshopify.com",
    products: true,
    inventory: false,
    status: "Not connected",
    imported: false,
    message: "",
  })
  useEffect(() => {
    if (resetSeen.current !== work.resetEpoch) {
      setLinks(seedLinks())
      resetSeen.current = work.resetEpoch
    }
  }, [work.resetEpoch])
  const liveLinks = links.filter(
    (link) => files.some((file) => file.id === link.fileId) && work.tasks.some((task) => task.id === link.taskId)
  )
  function linkFileToTask(fileId: string, taskId: string): string | null {
    const file = files.find((item) => item.id === fileId)
    const task = work.tasks.find((item) => item.id === taskId)
    if (!file || !task) return "Choose an existing sample file and task."
    if (!canLinkFile(file, task)) return "This sample file belongs to another team. Choose a task in the same team."
    if (!links.some((link) => link.fileId === fileId && link.taskId === taskId)) {
      setLinks((items) => [...items, { fileId, taskId, fileVersion: file.version }])
      work.touchTaskEvidence(taskId, `Linked sample file ${file.name}.`)
    }
    return null
  }
  function unlinkFileFromTask(fileId: string, taskId: string): void {
    if (links.some((link) => link.fileId === fileId && link.taskId === taskId)) {
      setLinks((items) => items.filter((link) => !(link.fileId === fileId && link.taskId === taskId)))
      work.touchTaskEvidence(taskId, "Removed a sample file attachment.")
    }
  }
  function addSampleFile(): string {
    const id = `FILE-${String(nextId.current++).padStart(3, "0")}`
    setFiles((items) => [
      ...items,
      {
        id,
        name: `Sample meeting notes ${id}.txt`,
        workspace: "Company Knowledge",
        owner: "Alex Morgan",
        type: "Document",
        sizeLabel: "1 KB",
        version: 1,
        content:
          "Fictional meeting notes. Agree a bounded next step, name an owner, and record the source for review. No real file was uploaded.",
        starred: false,
        source: "Added portfolio sample",
      },
    ])
    return id
  }
  function renameFile(id: string, name: string): string | null {
    if (name.trim().length < 3 || name.trim().length > 100) return "Use a file name between 3 and 100 characters."
    setFiles((items) => items.map((file) => (file.id === id ? { ...file, name: name.trim() } : file)))
    return null
  }
  function createTaskForFile(fileId: string, assignee?: string): string | null {
    const file = files.find((item) => item.id === fileId)
    if (!file) return null
    const selectedAssignee = assignee ?? file.owner
    if (!work.assignees.includes(selectedAssignee)) return null
    const id = work.addTask({
      title: `Review ${file.name}`,
      workspace: file.workspace,
      assignee: selectedAssignee,
      related: file.name,
      href: `#files?file=${file.id}`,
      sourceSnapshot: `${file.name} · version ${file.version}\n${file.source}\n${file.content}`,
      sourceVersion: file.version,
    })
    setLinks((items) => [...items, { fileId, taskId: id, fileVersion: file.version }])
    return id
  }
  function connectShopify(store: string, products: boolean, inventory: boolean): string | null {
    if (!validSampleStore(store))
      return "Enter a store name such as allura-sample.myshopify.com, without a URL or path."
    if (!products && !inventory) return "Choose Products, Inventory, or both for this example."
    setShopify((current) => ({
      ...current,
      store: store.trim().toLowerCase(),
      products,
      inventory,
      status: "Sample connected",
      message: "Sample connection ready. No Shopify account is connected.",
    }))
    return null
  }
  function importShopify(fail = false): string | null {
    if (shopify.status !== "Sample connected") return "Try the sample connection before importing examples."
    if (fail) {
      setShopify((current) => ({
        ...current,
        message: "Sample sync failed. Existing files were kept. Try importing the examples again.",
      }))
      return "Sample sync failed. Existing files were kept."
    }
    const examples: PreviewFile[] = []
    if (shopify.products)
      examples.push({
        id: sampleShopifyFileId(shopify.store, "products"),
        name: "Shopify sample product catalog.csv",
        workspace: "Sales",
        owner: "Alex Morgan",
        type: "Spreadsheet",
        sizeLabel: "1 KB",
        version: 1,
        content: "Sample SKU,Product\nDEMO-01,Example notebook\nDEMO-02,Example welcome kit",
        starred: false,
        source: `Simulated Shopify import · ${shopify.store}`,
      })
    if (shopify.inventory)
      examples.push({
        id: sampleShopifyFileId(shopify.store, "inventory"),
        name: "Shopify sample inventory.csv",
        workspace: "Sales",
        owner: "Alex Morgan",
        type: "Spreadsheet",
        sizeLabel: "1 KB",
        version: 1,
        content: "Sample SKU,Example units\nDEMO-01,12\nDEMO-02,8",
        starred: false,
        source: `Simulated Shopify import · ${shopify.store}`,
      })
    setFiles((items) => [...items, ...examples.filter((example) => !items.some((file) => file.id === example.id))])
    setShopify((current) => ({
      ...current,
      imported: true,
      message: "Sample files are in Files → Sales. Repeating this action does not duplicate them.",
    }))
    return null
  }
  return (
    <FilesContext.Provider
      value={{
        files,
        links: liveLinks,
        shopify,
        addSampleFile,
        renameFile,
        toggleStar: (id) =>
          setFiles((items) => items.map((file) => (file.id === id ? { ...file, starred: !file.starred } : file))),
        linkFileToTask,
        unlinkFileFromTask,
        filesForTask: (taskId) =>
          files.filter((file) => liveLinks.some((link) => link.taskId === taskId && link.fileId === file.id)),
        tasksForFile: (fileId) =>
          work.tasks.filter((task) => liveLinks.some((link) => link.fileId === fileId && link.taskId === task.id)),
        createTaskForFile,
        connectShopify,
        pauseShopify: () =>
          setShopify((current) => ({
            ...current,
            status: "Paused",
            message: "Sample imports paused. Imported examples remain in Files.",
          })),
        disconnectShopify: () =>
          setShopify((current) => ({
            ...current,
            status: "Not connected",
            message: "Sample connection removed. Imported examples remain in Files.",
          })),
        importShopify,
      }}
    >
      {children}
    </FilesContext.Provider>
  )
}
export function usePreviewFiles(): FilesValue {
  const context = useContext(FilesContext)
  if (!context) throw new Error("PreviewFilesProvider must wrap the HTML preview.")
  return context
}
