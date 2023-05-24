export const MEDIA_FRAGMENT = `#graphql
  fragment Media on Media {
    __typename
    mediaContentType
    alt
    previewImage {
      url
    }
    ... on MediaImage {
      id
      image {
        url
        width
        height
      }
    }
    ... on Video {
      id
      sources {
        mimeType
        url
      }
    }
    ... on Model3d {
      id
      sources {
        mimeType
        url
      }
    }
    ... on ExternalVideo {
      id
      embedUrl
      host
    }
  }
`;

export const PRODUCT_CARD_FRAGMENT = `#graphql
  fragment ProductCard on Product {
    id
    title
    publishedAt
    handle
    variants(first: 1) {
      nodes {
        id
        image {
          url
          altText
          width
          height
        }
        price {
          amount
          currencyCode
        }
        compareAtPrice {
          amount
          currencyCode
        }
        selectedOptions {
          name
          value
        }
        product {
          handle
          title
        }
      }
    }
  }
`;

const PRODUCT_COLORWAY_FRAGMENT = `#graphql
  fragment ProductColorway on Product {
    colorway: metafield(namespace: "fact", key: "color") {
      key
      id
      reference {
        ... on Metaobject {
          handle
          displayName: field(key: "display_name") {
            value
          }
          swatchImage: field(key: "swatch_image") {
            reference {
              ... on MediaImage {
                image {
                  altText
                  height
                  id
                  url
                  width
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const PRODUCT_CARD_WITH_GROUP_FRAGMENT = `#graphql
  ${PRODUCT_COLORWAY_FRAGMENT}
  fragment ProductCard on Product {
    id
    title
    publishedAt
    handle
    availableForSale
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    options {
      name
      values
    }
    variants(first: $variantsPageBy) {
      nodes {
        id
        image {
          url
          altText
          width
          height
        }
        price {
          amount
          currencyCode
        }
        compareAtPrice {
          amount
          currencyCode
        }
        selectedOptions {
          name
          value
        }
        product {
          handle
          title
        }
      }
    }
    ...ProductColorway
    productGroup: metafield(namespace: "custom", key: "product_group") {
      id
      value
      reference {
        ... on Metaobject {
          id
          handle
          field(key: "products") {
            key
            value
            references (first: 100) {
              nodes {
                ... on Product {
                  id
                  title
                  ...ProductColorway
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const PRODUCT_CARD_WITH_GROUP_FRAGMENT_NO_VARIANTS = `#graphql
  ${PRODUCT_COLORWAY_FRAGMENT}
  fragment ProductCard on Product {
    id
    title
    publishedAt
    handle
    availableForSale
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    options {
      name
      values
    }
    featuredImage {
      altText
      height
      id
      url
      width
    }
    ...ProductColorway
    productGroup: metafield(namespace: "custom", key: "product_group") {
      id
      value
      reference {
        ... on Metaobject {
          id
          handle
          field(key: "products") {
            key
            value
            references (first: 100) {
              nodes {
                ... on Product {
                  id
                  title
                  ...ProductColorway
                }
              }
            }
          }
        }
      }
    }
  }
`;
