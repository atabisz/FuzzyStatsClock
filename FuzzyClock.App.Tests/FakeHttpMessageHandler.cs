// Standard .NET test pattern — override SendAsync to return a prebuilt
// HttpResponseMessage. UpdateCheckService takes an optional HttpMessageHandler
// ctor parameter; the FakeHttpMessageHandler is wired in for service-shape tests.
using System.Net;
using System.Net.Http;
using System.Text;

namespace FuzzyClock.App.Tests;

internal sealed class FakeHttpMessageHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;

    /// <summary>Last request seen by SendAsync — service-shape tests assert on headers.</summary>
    public HttpRequestMessage? LastRequest { get; private set; }
    public int SendCount { get; private set; }

    public FakeHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder)
        => _responder = responder;

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        SendCount++;
        LastRequest = request;
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_responder(request));
    }

    /// <summary>Convenience factory — 200 OK with the supplied JSON body.</summary>
    public static FakeHttpMessageHandler Json(string body, HttpStatusCode status = HttpStatusCode.OK)
        => new(_ => new HttpResponseMessage(status)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        });
}
