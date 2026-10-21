// The inspector's public API: a host imports from here and nowhere else in this folder.
// How it behaves, how it is built and how to bring it to another host: SPEC.md.

export { attributeFor, handleFor } from './model/format';
export { buildReport, type InspectorReport } from './model/report';
export {
  createRequestLog,
  type RecordOptions,
  type RequestEntry,
  type RequestLog,
  type RequestRecorder,
} from './model/requests';
export type {
  InspectorEnv,
  InspectorTab,
  LineageSource,
  MetricDoc,
  MetricDocs,
  ModelTable,
  NodeRequest,
} from './model/types';
export {
  createInspectorStore,
  type InspectorSnapshot,
  type InspectorSource,
  type InspectorStore,
} from './source';
export { Inspector } from './ui/inspector';
export { copyText } from './ui/shared/copy-button';
export { kindIcons, kindPills } from './ui/shared/kind';
