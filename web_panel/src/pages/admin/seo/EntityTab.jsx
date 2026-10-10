import PagesTable from "./PagesTable";

export default function EntityTab({ kind }) {
  if (kind === "services") {
    return (
      <div className="space-y-4" data-testid="seo-services">
        <p className="text-xs text-slate-500 bg-white rounded-lg border border-slate-200 px-4 py-2.5">Every service automatically gets SEO from its real name, category, price, verified booking ratings and cities where it is priced.
          Overrides here win over subcategory → category → global defaults and never change those levels.</p>
        <PagesTable types="service" title="Service SEO" subtitle="Server-side paginated · click a row to open the advanced editor" testId="services-table" />
      </div>
    );
  }
  return (
    <div className="space-y-4" data-testid="seo-categories">
      <p className="text-xs text-slate-500 bg-white rounded-lg border border-slate-200 px-4 py-2.5">Categories and subcategories can define <b>child defaults</b> (title template, description, robots, share image) inherited by their services, plus their own page overrides.</p>
      <PagesTable types="category,subcategory" title="Category & Subcategory SEO" testId="categories-table" />
    </div>
  );
}
