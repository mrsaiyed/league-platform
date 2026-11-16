// A league's design: a small JSON document checked against a schema (T5 §1). Its written
// shape lives in packages/contracts (site-design.ts), so that core checks a design it
// publishes, and the database keeps it, by the very schema this package draws by
// (record 073, T-277). Here it is the same schema, re-exported unchanged.
export {
  designDocumentSchema,
  parseDesignDocument,
  type DesignDocument,
} from '@srleagues/contracts';
