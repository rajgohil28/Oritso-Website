import type { Schema, Struct } from '@strapi/strapi';

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: 'Per-page metadata. The current site ships every solution page titled "... - My Framer Site" and the homepage\'s generic description everywhere \u2014 this component exists so that stops.';
    displayName: 'SEO';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 160;
      }>;
    metaTitle: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 60;
      }>;
    ogImage: Schema.Attribute.Media<'images'>;
  };
}

export interface SolutionFeature extends Struct.ComponentSchema {
  collectionName: 'components_solution_features';
  info: {
    description: 'One entry in a Solution\'s "Key Features & Benefits" grid. Title only \u2014 Framer\'s cards never carried a description, just an icon and a short title.';
    displayName: 'Feature';
  };
  attributes: {
    icon: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 60;
      }>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'shared.seo': SharedSeo;
      'solution.feature': SolutionFeature;
    }
  }
}
