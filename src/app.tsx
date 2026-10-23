import { lazy, Suspense } from "react"
import { Landing } from "./site/landing"

const RecordView = lazy(() => import("./site/record-view"))

export function App() {
  const record = new URLSearchParams(window.location.search).get("record")
  if (record) {
    return (
      <Suspense fallback={null}>
        <RecordView view={record} />
      </Suspense>
    )
  }
  return <Landing />
}
