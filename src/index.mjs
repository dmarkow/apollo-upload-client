import { ApolloLink, Observable } from 'apollo-link'
import { print } from 'graphql/language/printer'
import { extractFiles } from '@novistore/extract-files'

export { ReactNativeFile } from '@novistore/extract-files'

export const createUploadLink = ({
  includeExtensions,
  uri: linkUri = '/graphql',
  credentials: linkCredentials,
  headers: linkHeaders,
  fetchOptions: linkFetchOptions = {},
  fetch: linkFetch = fetch
} = {}) =>
  new ApolloLink(
    ({ operationName, variables, query, extensions, getContext, setContext }) =>
      new Observable(observer => {
        const requestOperation = { query: print(query) }

        if (operationName) requestOperation.operationName = operationName
        if (Object.keys(variables).length)
          requestOperation.variables = variables
        if (extensions && includeExtensions)
          requestOperation.extensions = extensions

        const files = extractFiles(requestOperation)

        const {
          uri = linkUri,
          credentials = linkCredentials,
          headers: contextHeaders,
          fetchOptions: contextFetchOptions = {}
        } = getContext()

        const fetchOptions = {
          ...linkFetchOptions,
          ...contextFetchOptions,
          headers: {
            ...linkFetchOptions.headers,
            ...contextFetchOptions.headers,
            ...linkHeaders,
            ...contextHeaders
          },
          method: 'POST'
        }

        if (credentials) fetchOptions.credentials = credentials

        if (files.length) {
          // GraphQL multipart request spec:
          // https://github.com/jaydenseric/graphql-multipart-request-spec

          fetchOptions.body = new FormData()

          const { query, operationName, variables } = requestOperation
          fetchOptions.body.append('query', query)
          fetchOptions.body.append('operationName', operationName)
          fetchOptions.body.append('variables', JSON.stringify(variables))

          files.forEach(({ file, index }) =>
            fetchOptions.body.append(index, file)
          )
        } else {
          fetchOptions.headers['content-type'] = 'application/json'
          fetchOptions.body = JSON.stringify(requestOperation)
        }

        linkFetch(uri, fetchOptions)
          .then(response => {
            setContext({ response })
            if (!response.ok)
              throw new Error(`${response.status} (${response.statusText})`)
            return response.json()
          })
          .then(result => {
            observer.next(result)
            observer.complete()
          })
          .catch(error => observer.error(error))
      })
  )
