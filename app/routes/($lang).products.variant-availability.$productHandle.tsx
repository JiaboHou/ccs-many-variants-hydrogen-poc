import {type ReactNode, useRef, Suspense, useMemo, Fragment} from 'react';
import {defer, SerializeFrom, type LoaderArgs} from '@shopify/remix-oxygen';
import {
  useLoaderData,
  Await,
  useLocation,
  useAsyncValue,
} from '@remix-run/react';

import {AnalyticsPageType, ShopifyAnalyticsProduct} from '@shopify/hydrogen';
import {
  Heading,
  ProductGallery,
  ProductSwimlane,
  Section,
  Skeleton,
  Text,
  Link,
} from '~/components';
import {getExcerpt} from '~/lib/utils';
import {seoPayload} from '~/lib/seo.server';
import invariant from 'tiny-invariant';
import clsx from 'clsx';
import type {
  ProductVariant,
  SelectedOptionInput,
  Product as ProductType,
  Shop,
  ProductOption,
  SelectedOption,
} from '@shopify/hydrogen/storefront-api-types';
import {MEDIA_FRAGMENT} from '~/data/fragments';
import type {Storefront} from '~/lib/type';
import type {Product} from 'schema-dts';
import {routeHeaders, CACHE_SHORT} from '~/data/cache';
import {
  getRecommendedProducts,
  ProductDetail,
  ProductForm,
} from '~/routes/($lang).products.$productHandle';

export const headers = routeHeaders;

export async function loader({params, request, context}: LoaderArgs) {
  const {productHandle} = params;
  invariant(productHandle, 'Missing productHandle param, check route filename');

  const searchParams = new URL(request.url).searchParams;

  const selectedOptions: SelectedOptionInput[] = [];
  searchParams.forEach((value, name) => {
    selectedOptions.push({name, value});
  });

  const {shop, product} = await context.storefront.query<{
    product: ProductType & {selectedVariant?: ProductVariant};
    shop: Shop;
  }>(PRODUCT_QUERY, {
    variables: {
      handle: productHandle,
      selectedOptions,
      country: context.storefront.i18n.country,
      language: context.storefront.i18n.language,
    },
  });

  if (!product?.id) {
    throw new Response('product', {status: 404});
  }

  const recommended = getRecommendedProducts(context.storefront, product.id);
  const firstVariant = product.variants.nodes[0];
  const selectedVariant = product.selectedVariant ?? firstVariant;

  const productAnalytics: ShopifyAnalyticsProduct = {
    productGid: product.id,
    variantGid: selectedVariant.id,
    name: product.title,
    variantName: selectedVariant.title,
    brand: product.vendor,
    price: selectedVariant.price.amount,
  };

  const seo = seoPayload.product({
    product,
    selectedVariant,
    url: request.url,
  });

  const disableCache = 'disableCache';
  const variants = getAllProductVariants(context.storefront, product.id, {
    disableCache: searchParams.get(disableCache) === '1',
  });

  return defer(
    {
      product,
      variants,
      shop,
      storeDomain: shop.primaryDomain.url,
      recommended,
      analytics: {
        pageType: AnalyticsPageType.product,
        resourceId: product.id,
        products: [productAnalytics],
        totalValue: parseFloat(selectedVariant.price.amount),
      },
      seo,
    },
    {
      headers: {
        'Cache-Control': CACHE_SHORT,
      },
    },
  );
}

export default function Product() {
  const {product, shop, recommended} = useLoaderData<typeof loader>();
  const {media, title, vendor, descriptionHtml} = product;
  const {shippingPolicy, refundPolicy} = shop;

  return (
    <>
      <Section className="px-0 md:px-8 lg:px-12">
        <div className="grid items-start md:gap-6 lg:gap-20 md:grid-cols-2 lg:grid-cols-3">
          <ProductGallery
            media={media.nodes}
            className="w-full lg:col-span-2"
          />
          <div className="sticky md:-mb-nav md:top-nav md:-translate-y-nav md:h-screen md:pt-nav hiddenScroll md:overflow-y-scroll">
            <section className="flex flex-col w-full max-w-xl gap-8 p-6 md:mx-auto md:max-w-sm md:px-0">
              <div className="grid gap-2">
                <Heading as="h1" className="whitespace-normal">
                  {title}
                </Heading>
                {vendor && (
                  <Text className={'opacity-50 font-medium'}>{vendor}</Text>
                )}
              </div>
              <ProductForm ProductOptionsComponent={ProductOptions} />
              <div className="grid gap-4 py-4">
                {descriptionHtml && (
                  <ProductDetail
                    title="Product Details"
                    content={descriptionHtml}
                  />
                )}
                {shippingPolicy?.body && (
                  <ProductDetail
                    title="Shipping"
                    content={getExcerpt(shippingPolicy.body)}
                    learnMore={`/policies/${shippingPolicy.handle}`}
                  />
                )}
                {refundPolicy?.body && (
                  <ProductDetail
                    title="Returns"
                    content={getExcerpt(refundPolicy.body)}
                    learnMore={`/policies/${refundPolicy.handle}`}
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      </Section>
      <Suspense fallback={<Skeleton className="h-32" />}>
        <Await
          errorElement="There was a problem loading related products"
          resolve={recommended}
        >
          {(products) => (
            <ProductSwimlane title="Related Products" products={products} />
          )}
        </Await>
      </Suspense>
    </>
  );
}

function ProductOptions({
  options,
  searchParamsWithDefaults,
}: {
  options: ProductType['options'];
  searchParamsWithDefaults: URLSearchParams;
}) {
  const {variants} = useLoaderData<typeof loader>();
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      {options
        .filter((option) => option.values.length > 1)
        .map((option) => (
          <div
            key={option.name}
            className="flex flex-col flex-wrap mb-4 gap-y-2 last:mb-0"
          >
            <Heading as="legend" size="lead" className="min-w-[4rem]">
              {option.name}
            </Heading>
            <div className="flex flex-wrap items-baseline gap-4">
              {/**
               * First, we render a bunch of <Link> elements for each option value.
               * When the user clicks one of these buttons, it will hit the loader
               * to get the new data.
               */}
              <Suspense>
                <Await resolve={variants}>
                  <ProductOptionLinks
                    searchParams={searchParamsWithDefaults}
                    option={option}
                  />
                </Await>
              </Suspense>
            </div>
          </div>
        ))}
    </>
  );
}

function ProductOptionLinks({
  option,
  searchParams,
}: {
  option: ProductOption;
  searchParams: URLSearchParams;
}) {
  const {product} = useLoaderData<typeof loader>();

  const variants = useAsyncValue() as Awaited<
    SerializeFrom<typeof loader>['variants']
  >;

  // Get list of selected options that are not the current option being rendered by this component.
  const otherSelectedOptions = useMemo(
    () =>
      product.options.reduce<SelectedOption[]>(
        (acc: SelectedOption[], currOption: ProductOption) => {
          if (currOption.name === option.name) {
            return acc;
          }

          const selectedValue = searchParams.get(currOption.name);
          invariant(selectedValue, 'Missing option value');

          const selectedOption: SelectedOption = {
            name: currOption.name,
            value: selectedValue,
          };

          return [...acc, selectedOption];
        },
        [],
      ),
    [product, searchParams, option.name],
  );
  // console.log('otherSelectedOptions', otherSelectedOptions)

  // Get list of variants that match otherSelectedOptions.
  const siblingVariants = useMemo(
    () =>
      variants?.filter?.((variant: ProductVariant) =>
        otherSelectedOptions.every((otherSelectedOption: SelectedOption) =>
          variant.selectedOptions.some(
            (selectedOption) =>
              selectedOption.name === otherSelectedOption.name &&
              selectedOption.value === otherSelectedOption.value,
          ),
        ),
      ),
    [otherSelectedOptions, variants],
  );
  // console.log('siblingVariants', siblingVariants)

  return (
    <>
      {option.values.map((value) => {
        const checked = searchParams.get(option.name) === value;
        const id = `option-${option.name}-${value}`;

        const associatedVariant = siblingVariants?.find?.(
          (variant: ProductVariant) =>
            // Find the variant that matches the current selected options.
            variant.selectedOptions.some(
              (selectedOption) =>
                selectedOption.name === option.name &&
                selectedOption.value === value,
            ),
        );

        return (
          <Fragment key={id}>
            <Text key={id}>
              <ProductOptionLink
                optionName={option.name}
                optionValue={value}
                variant={associatedVariant}
                searchParams={searchParams}
                className={clsx(
                  'leading-none py-1 border-b-[1.5px] cursor-pointer transition-all duration-200',
                  checked ? 'border-primary/50' : 'border-primary/0',
                )}
              />
            </Text>
          </Fragment>
        );
      })}
    </>
  );
}

function ProductOptionLink({
  optionName,
  optionValue,
  searchParams,
  children,
  className,
  variant,
  ...props
}: {
  optionName: string;
  optionValue: string;
  searchParams: URLSearchParams;
  variant?: ProductVariant;
  children?: ReactNode;
  [key: string]: any;
}) {
  const {pathname} = useLocation();
  const isLangPathname = /\/[a-zA-Z]{2}-[a-zA-Z]{2}\//g.test(pathname);
  // fixes internalized pathname
  const path = isLangPathname
    ? `/${pathname.split('/').slice(2).join('/')}`
    : pathname;

  const clonedSearchParams = new URLSearchParams(searchParams);
  clonedSearchParams.set(optionName, optionValue);

  // Check if the associated variant is available for sale.
  const availableForSale = variant?.availableForSale ?? true;
  const linkClassNames = clsx(className, {
    'line-through': !availableForSale,
    'font-bold': availableForSale,
  });

  return (
    <Link
      {...props}
      preventScrollReset
      prefetch="intent"
      replace
      className={linkClassNames}
      to={`${path}?${clonedSearchParams.toString()}`}
    >
      {children ?? optionValue}
    </Link>
  );
}

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariantFragment on ProductVariant {
    id
    availableForSale
    selectedOptions {
      name
      value
    }
    image {
      id
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
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
    product {
      title
      handle
    }
  }
`;

const PRODUCT_QUERY = `#graphql
  ${MEDIA_FRAGMENT}
  ${PRODUCT_VARIANT_FRAGMENT}
  query Product(
    $country: CountryCode
    $language: LanguageCode
    $handle: String!
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      title
      vendor
      handle
      descriptionHtml
      description
      options {
        name
        values
      }
      selectedVariant: variantBySelectedOptions(selectedOptions: $selectedOptions) {
        ...ProductVariantFragment
      }
      media(first: 7) {
        nodes {
          ...Media
        }
      }
      variants(first: 1) {
        nodes {
          ...ProductVariantFragment
        }
      }
      seo {
        description
        title
      }
    }
    shop {
      name
      primaryDomain {
        url
      }
      shippingPolicy {
        body
        handle
      }
      refundPolicy {
        body
        handle
      }
    }
  }
`;

const VARIANT_PAGINATION_LIMIT = 250;
const PRODUCT_VARIANT_INVENTORY_QUERY = `#graphql
  query ProductVariantInventory(
    $productId: ID!
    $variantsFirst: Int = ${VARIANT_PAGINATION_LIMIT}
    $variantsAfter: String
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    product(id: $productId) {
      id
      variants(first: $variantsFirst, after: $variantsAfter) {
        nodes {
          id
          availableForSale
          currentlyNotInStock
          quantityAvailable
          sku
          image {
            altText
            height
            id
            url
            width
          }
          compareAtPrice {
            amount
            currencyCode
          }
          price {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

async function getAllProductVariants(
  storefront: Storefront,
  productId: string,
  options: {disableCache: boolean} = {disableCache: false},
) {
  let variants: Array<ProductVariant> = [];
  let hasNextPage = true;
  let variantsEndCursor = '';
  let requestCount = 0;

  console.log(`Fetching product variants for ${productId}`);
  const fetchTimes = [];

  const cachePolicy = options.disableCache
    ? storefront.CacheNone()
    : storefront.CacheShort();
  // console.log(`disable cache?: ${options.disableCache}`);
  while (hasNextPage && requestCount <= 25) {
    const initialTime = new Date().getTime();
    const query = await storefront.query<{
      product: Pick<ProductType, 'id' | 'variants'>;
    }>(PRODUCT_VARIANT_INVENTORY_QUERY, {
      variables: {
        productId,
        variantsFirst: VARIANT_PAGINATION_LIMIT,
        variantsAfter: variantsEndCursor || undefined,
      },
      cache: cachePolicy,
    });

    fetchTimes.push(new Date().getTime() - initialTime);

    invariant(query?.product, 'No data returned from Shopify API');

    variants = [...variants, ...(query.product?.variants.nodes ?? [])];
    variantsEndCursor = query.product?.variants.pageInfo.endCursor ?? '';
    hasNextPage = query.product?.variants.pageInfo.hasNextPage;
    requestCount += 1;
    // console.log(
    //   `Fetched ${query.product?.variants.nodes.length} variants in page #${requestCount}`,
    // );
  }
  console.log(
    `fetch times: ${fetchTimes.join('ms, ')}ms | sum: ${fetchTimes.reduce(
      (a, b) => a + b,
      0,
    )}ms`,
  );
  return variants;
}
