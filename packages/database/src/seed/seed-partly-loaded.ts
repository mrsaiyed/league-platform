// A seed league found in the test database but not whole: an earlier load stopped
// part-way, or the database was loaded by an older seed. The loaders throw it; `npm run
// seed` catches it and says, in one sentence, which folder to delete and what to run.

export class SeedPartlyLoaded extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(
      `The seed league ${slug} is only partly loaded (an earlier load stopped part-way, or an older seed loaded it). Start again from a fresh database.`,
    );
    this.name = 'SeedPartlyLoaded';
    this.slug = slug;
  }
}
