# Studio File Manager adapters

Source: `arhamkhnz/next-shadcn-admin-dashboard`, Base UI File Manager acquisition at `/tmp/allura-studio-baseui-20261019`. Upstream MIT notices are retained by the parent vendoring process in `studio-baseui/`. These adapters preserve the upstream page component composition and connect it to local portfolio state.

| Source component | Source SHA-256 | Adaptation |
| --- | --- | --- |
| `file-grid-view.tsx` | `50eaaa6f2c3fdcd64c773fabc715df7799ab7166a4f95838b54a51eaab26c1b2` | Card/Content/Header/Description/Action preserved. Uses controlled PreviewFiles, working detail selection and favorites; removes inert action menu and invented modified date. |
| `file-list-view.tsx` | `0517955a421d3a6f3aeb1c4065dc10fa812dc81389b840414a02dae75a35729a` | Table/Avatar/Badge/Button composition preserved. Controlled PreviewFiles; working detail selection and favorites; team/version replace modified date. |
| `folders-section.tsx` | `4ccb9c552aa5d61d799cbf4a855b2b5877c37dfe0c01581ac980817a930274cf` | Folder Card/Header/Content composition preserved. Live sample file counts and working Open folder buttons replace inert menus, sharing and timestamps. |

The page retains its shared inspector, file-to-task links, active task-owner choice, review invalidation and simulated role controls. It adds the source page’s folder browsing and grid/list choice. No upload, sharing, backend authorization or real connector is introduced. Cream and accessible Allura semantic colors replace the template skin.
