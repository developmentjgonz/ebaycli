using Microsoft.AspNetCore.Http.HttpResults;

namespace EbayStoreManager.Api.Infrastructure;

public static class HttpResults
{
    public static ProblemHttpResult Problem(int statusCode, string title, string detail)
        => TypedResults.Problem(title: title, detail: detail, statusCode: statusCode);
}
