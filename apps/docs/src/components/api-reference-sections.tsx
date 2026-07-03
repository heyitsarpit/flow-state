type ApiReferenceEntry = Readonly<{
  readonly name: string;
  readonly description: string;
  readonly href: string;
}>;

type ApiReferenceSection = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly importPath: string;
  readonly description: string;
  readonly entries: ReadonlyArray<ApiReferenceEntry>;
}>;

type ApiReferenceSectionsProps = Readonly<{
  readonly sections: ReadonlyArray<ApiReferenceSection>;
}>;

export function ApiReferenceSections({ sections }: ApiReferenceSectionsProps) {
  return sections.map((section) => (
    <section key={section.id}>
      <h2 id={section.id}>{section.title}</h2>
      <p>{section.description}</p>
      <p>
        Import path: <code data-v>{section.importPath}</code>
      </p>
      <div data-v-table-wrapper>
        <table data-v>
          <thead>
            <tr>
              <th>API</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {section.entries.map((entry) => (
              <tr key={entry.name}>
                <td>
                  <code data-v>
                    <a href={entry.href}>{entry.name}</a>
                  </code>
                </td>
                <td>{entry.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  ));
}
