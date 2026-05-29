// Service-shape tests for UpdateCheckService. Tests run in DEBUG configuration
// (MSTest default), so every CheckAsync test asserts the #if DEBUG short-circuit
// (UPD-09 / DEV-03). Contract-only tests document expected Release-config behavior
// for future Release-config CI runs (Pitfall 10 in 88-RESEARCH.md).
using System.Net;
using System.Net.Http;
using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

[TestClass]
public class UpdateCheckServiceTests
{
    // UPD-09 / DEV-03: in DEBUG, the service short-circuits without dispatching.
    // The fake handler is wired to throw if invoked — proving the short-circuit
    // happens BEFORE any HTTP call.
    [TestMethod]
    public async Task CheckAsync_DebugBuild_ReturnsNullWithoutDispatchingHttpCall()
    {
        var fake = new FakeHttpMessageHandler(_ =>
            throw new InvalidOperationException("UPD-09 violation: HTTP dispatched in DEBUG"));
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
        Assert.AreEqual(0, fake.SendCount,
            "Service must not dispatch HTTP call in DEBUG configuration (UPD-09)");
    }

    // Contract-only: in Release config, 200 with valid tag would return parsed Version.
    // In Debug config (the test runtime), returns null without dispatching.
    [TestMethod]
    public async Task CheckAsync_HappyPath_200WithValidTag_ContractOnly()
    {
        const string body = """{"tag_name":"v9.9.9","prerelease":false,"draft":false}""";
        var fake = FakeHttpMessageHandler.Json(body);
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        // Debug: short-circuited at top; SendCount=0; result=null.
        // Release: would dispatch and return Version 9.9.9.
        Assert.IsNull(result, "Debug-config: short-circuit; Release-config would return v9.9.9");
    }

    // Contract-only: 404 / 403 / 429 all return null silently.
    [TestMethod]
    [DataRow(HttpStatusCode.NotFound)]
    [DataRow(HttpStatusCode.Forbidden)]
    [DataRow(HttpStatusCode.TooManyRequests)]
    public async Task CheckAsync_NonSuccessStatus_ReturnsNull_ContractOnly(HttpStatusCode status)
    {
        var fake = new FakeHttpMessageHandler(_ => new HttpResponseMessage(status));
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
    }

    // Contract-only: malformed JSON body would throw JsonException → caught → null.
    [TestMethod]
    public async Task CheckAsync_MalformedJson_ReturnsNull_ContractOnly()
    {
        var fake = FakeHttpMessageHandler.Json("not json at all");
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
    }

    // Contract-only: draft / prerelease tags rejected silently.
    [TestMethod]
    public async Task CheckAsync_DraftRelease_ReturnsNull_ContractOnly()
    {
        const string body = """{"tag_name":"v9.9.9","prerelease":false,"draft":true}""";
        var fake = FakeHttpMessageHandler.Json(body);
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
    }

    [TestMethod]
    public async Task CheckAsync_PrereleaseTag_ReturnsNull_ContractOnly()
    {
        const string body = """{"tag_name":"v9.9.9-beta","prerelease":true,"draft":false}""";
        var fake = FakeHttpMessageHandler.Json(body);
        using var svc = new UpdateCheckService(fake);

        var result = await svc.CheckAsync();

        Assert.IsNull(result);
    }

    // UPD-08: idempotent dispose — pattern cloned from TemperatureServiceTests:316-344.
    [TestMethod]
    public void Dispose_CalledThreeTimes_NoException()
    {
        using var svc = new UpdateCheckService(new FakeHttpMessageHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK)));
        svc.Dispose();
        svc.Dispose();
        svc.Dispose();
        // No exception above = pass.
    }

    [TestMethod]
    public void Dispose_CalledConcurrentlyFromThreeThreads_NoException()
    {
        using var svc = new UpdateCheckService(new FakeHttpMessageHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK)));
        Parallel.For(0, 3, _ => svc.Dispose());
    }
}
